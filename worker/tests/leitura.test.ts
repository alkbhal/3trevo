import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleLeitura } from '../src/routes/leitura';

const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc' } as any;
const req = (token?: string) =>
  new Request('https://api.test/api/leitura/livre-das-dividas', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const TOKEN = 'a'.repeat(40);
const LINHAS = [
  { capitulo_id: 'cap1', acesso: 'livre', versao: 'v1', conteudo: { id: 'cap1', titulo: 'Capítulo 1' } },
  { capitulo_id: 'cap3', acesso: 'compra', versao: 'v1', conteudo: { id: 'cap3', titulo: 'Capítulo 3' } },
];

function mock(o: { user?: boolean; compra?: unknown[]; status?: number; conteudo?: unknown[] }) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    if (url.includes('/auth/v1/user')) return o.user === false ? new Response('x', { status: 401 }) : Response.json({ id: 'u1', email: 'a@b.c' });
    if (url.includes('/rest/v1/user_library')) return new Response(JSON.stringify(o.compra ?? []), { status: o.status ?? 200 });
    if (url.includes('/rest/v1/obra_conteudo')) return Response.json(o.conteudo ?? LINHAS);
    return new Response('?', { status: 500 });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('GET /api/leitura/:slug — uma fonte, dois níveis de acesso', () => {
  it('obra desconhecida ou slug inválido: 404 sem consultar nada', async () => {
    const calls = mock({});
    expect((await handleLeitura(req(), env, '3a-guerra')).status).toBe(404);
    expect((await handleLeitura(req(), env, '../x')).status).toBe(404);
    expect(calls).toHaveLength(0);
  });
  it('visitante: índice completo e só os capítulos livres, sem consultar a biblioteca', async () => {
    const calls = mock({});
    const r = await handleLeitura(req(), env, 'livre-das-dividas');
    const d: any = await r.json();
    expect(r.status).toBe(200);
    expect(d.indice.map((i: any) => [i.id, i.acesso])).toEqual([['cap1', 'livre'], ['cap3', 'compra']]);
    expect(d.capitulos.map((c: any) => c.id)).toEqual(['cap1']);
    expect(d.comprador).toBe(false);
    expect(calls.some((u) => u.includes('user_library'))).toBe(false);
  });
  it('logado sem compra: só os livres, sem cache público', async () => {
    mock({ compra: [] });
    const r = await handleLeitura(req(TOKEN), env, 'livre-das-dividas');
    const d: any = await r.json();
    expect(d.capitulos.map((c: any) => c.id)).toEqual(['cap1']);
    expect(d.logado).toBe(true);
    expect(r.headers.get('Cache-Control')).toContain('no-store');
  });
  it('token inválido vale como visitante', async () => {
    mock({ user: false });
    const d: any = await (await handleLeitura(req(TOKEN), env, 'livre-das-dividas')).json();
    expect(d.logado).toBe(false);
    expect(d.capitulos).toHaveLength(1);
  });
  it('comprador: todos os capítulos, na ordem, sem cache', async () => {
    const calls = mock({ compra: [{ product_id: 'p' }] });
    const r = await handleLeitura(req(TOKEN), env, 'livre-das-dividas');
    const d: any = await r.json();
    expect(d.capitulos.map((c: any) => c.id)).toEqual(['cap1', 'cap3']);
    expect(d.comprador).toBe(true);
    expect(r.headers.get('Cache-Control')).toContain('no-store');
    expect(calls.find((u) => u.includes('user_library'))).toContain('user_id=eq.u1');
    expect(calls.find((u) => u.includes('obra_conteudo'))).toContain('order=ordem.asc');
  });
  it('falha da biblioteca: 503 (não entrega como visitante por engano)', async () => {
    mock({ status: 500 });
    expect((await handleLeitura(req(TOKEN), env, 'livre-das-dividas')).status).toBe(503);
  });
  it('conteúdo ainda não carregado: 503', async () => {
    mock({ conteudo: [] });
    expect((await handleLeitura(req(), env, 'livre-das-dividas')).status).toBe(503);
  });
});
