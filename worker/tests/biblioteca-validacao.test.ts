// worker/tests/biblioteca-validacao.test.ts
// Achados reais da auditoria (01/09): slot_id ia direto pra filtro PostgREST sem checar
// tipo/formato (injection), e admin acervo create/update gravava o body cru sem schema.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { bibliotecaAcervoSchema, parsePositiveInt } from '../src/routes/biblioteca';

describe('parsePositiveInt (slot_id)', () => {
  it('aceita um id numérico real', () => {
    expect(parsePositiveInt(42)).toBe(42);
    expect(parsePositiveInt('42')).toBe(42);
  });

  it('rejeita valores que tentam injetar operadores PostgREST', () => {
    expect(parsePositiveInt('1&status=eq.lendo')).toBe(null);
    expect(parsePositiveInt('1 or 1=1')).toBe(null);
  });

  it('rejeita zero, negativo, vazio e não-numérico', () => {
    expect(parsePositiveInt(0)).toBe(null);
    expect(parsePositiveInt(-1)).toBe(null);
    expect(parsePositiveInt('')).toBe(null);
    expect(parsePositiveInt(undefined)).toBe(null);
  });
});

describe('bibliotecaAcervoSchema', () => {
  it('aceita um payload real de criação', () => {
    const r = bibliotecaAcervoSchema.safeParse({
      slug: 'dom-casmurro', titulo: 'Dom Casmurro', autor: 'Machado de Assis', acesso: 'bonus',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita slug fora do padrão kebab-case', () => {
    const r = bibliotecaAcervoSchema.safeParse({ slug: 'Não Válido!', titulo: 'X' });
    expect(r.success).toBe(false);
  });

  it('rejeita acesso fora do enum bonus/compra', () => {
    const r = bibliotecaAcervoSchema.safeParse({ acesso: 'gratis' });
    expect(r.success).toBe(false);
  });

  it('rejeita product_id que não é uuid', () => {
    const r = bibliotecaAcervoSchema.safeParse({ product_id: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });

  it('ignora campos fora do schema (só chaves declaradas passam adiante)', () => {
    const r = bibliotecaAcervoSchema.safeParse({ titulo: 'X', epub_url: 'a.epub', campo_indevido: '<script>' });
    expect(r.success).toBe(true);
    expect((r as any).data.campo_indevido).toBeUndefined();
  });
});

// Freemium (referência de UI "dashboard pós-login"): quem tem conta lê os clássicos.
// A sessão só nasce de um token de usuário que o Supabase Auth confirma.
describe('POST /api/biblioteca/sessao-conta', () => {
  const kvFake = () => {
    const m = new Map<string, string>();
    return { m, kv: { get: async (k: string) => m.get(k) ?? null, put: async (k: string, v: string) => { m.set(k, v); }, delete: async (k: string) => { m.delete(k); } } as unknown as KVNamespace };
  };
  const pedir = (auth?: string) => new Request('https://api.test/api/biblioteca/sessao-conta', { method: 'POST', headers: auth ? { Authorization: auth } : {} });
  const TOKEN = 'Bearer ' + 'a'.repeat(40);

  afterEach(() => { vi.unstubAllGlobals(); });

  it('sem token, ou token que o Supabase recusa → 401 e nenhuma sessão criada', async () => {
    const { handleBibliotecaSessaoConta } = await import('../src/routes/biblioteca');
    const { m, kv } = kvFake();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'k', TT_KV: kv } as any;
    expect((await handleBibliotecaSessaoConta(pedir(), env)).status).toBe(401);
    expect((await handleBibliotecaSessaoConta(pedir(TOKEN), env)).status).toBe(401);
    expect([...m.keys()].filter((k) => k.startsWith('bib:session:'))).toEqual([]);
  });

  it('token confirmado → sessão de leitor com o e-mail da conta, em minúsculas', async () => {
    const { handleBibliotecaSessaoConta } = await import('../src/routes/biblioteca');
    const { m, kv } = kvFake();
    const chamadas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { chamadas.push(String(url)); return Response.json({ id: 'u1', email: 'Leitor@Teste.com' }); }));
    const r = await handleBibliotecaSessaoConta(pedir(TOKEN), { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'k', TT_KV: kv } as any);
    const d = await r.json() as any;
    expect(r.status).toBe(200);
    expect(chamadas[0]).toBe('https://sb.test/auth/v1/user');
    expect(d.email).toBe('leitor@teste.com');
    expect(m.get(`bib:session:${d.token}`)).toBe('leitor@teste.com');
    expect(d.token).toMatch(/^[0-9a-f]{80}$/);
  });

  it('limite de 30 sessões por conta por hora', async () => {
    const { handleBibliotecaSessaoConta } = await import('../src/routes/biblioteca');
    const { m, kv } = kvFake();
    m.set('rl:bib-conta:u1', '30');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 'u1', email: 'a@b.com' })));
    const r = await handleBibliotecaSessaoConta(pedir(TOKEN), { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'k', TT_KV: kv } as any);
    expect(r.status).toBe(429);
  });
});
