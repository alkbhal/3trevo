import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleLeitura } from '../src/routes/leitura';

const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc' } as any;
const req = (token?: string) =>
  new Request('https://api.test/api/leitura/livre-das-dividas', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
const TOKEN = 'a'.repeat(40);

function mock(o: { user?: boolean; compra?: unknown[]; conteudo?: unknown[]; status?: number }) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    if (url.includes('/auth/v1/user')) return o.user === false ? new Response('x', { status: 401 }) : Response.json({ id: 'u1', email: 'a@b.c' });
    if (url.includes('/rest/v1/user_library')) return new Response(JSON.stringify(o.compra ?? []), { status: o.status ?? 200 });
    if (url.includes('/rest/v1/obra_conteudo')) return Response.json(o.conteudo ?? []);
    return new Response('?', { status: 500 });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('GET /api/leitura/:slug', () => {
  it('obra desconhecida ou slug inválido: 404 sem consultar nada', async () => {
    const calls = mock({});
    expect((await handleLeitura(req(TOKEN), env, '3a-guerra')).status).toBe(404);
    expect((await handleLeitura(req(TOKEN), env, '../x')).status).toBe(404);
    expect(calls).toHaveLength(0);
  });
  it('sem login: 401', async () => {
    mock({ user: false });
    expect((await handleLeitura(req(), env, 'livre-das-dividas')).status).toBe(401);
  });
  it('logado sem compra: 403 e não lê o conteúdo', async () => {
    const calls = mock({ compra: [] });
    const r = await handleLeitura(req(TOKEN), env, 'livre-das-dividas');
    expect(r.status).toBe(403);
    expect(calls.some((u) => u.includes('obra_conteudo'))).toBe(false);
  });
  it('comprador: 200 com capítulos na ordem e sem cache público', async () => {
    const calls = mock({ compra: [{ product_id: 'p' }], conteudo: [{ capitulo_id: 'cap3', conteudo: { id: 'cap3' }, versao: 'v1' }] });
    const r = await handleLeitura(req(TOKEN), env, 'livre-das-dividas');
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toContain('no-store');
    const d: any = await r.json();
    expect(d).toEqual({ ok: true, versao: 'v1', capitulos: [{ id: 'cap3' }] });
    expect(calls.find((u) => u.includes('user_library'))).toContain('user_id=eq.u1');
    expect(calls.find((u) => u.includes('obra_conteudo'))).toContain('order=ordem.asc');
  });
  it('falha do banco: 503', async () => {
    mock({ status: 500 });
    expect((await handleLeitura(req(TOKEN), env, 'livre-das-dividas')).status).toBe(503);
  });
  it('conteúdo ainda não carregado: 503', async () => {
    mock({ compra: [{ product_id: 'p' }], conteudo: [] });
    expect((await handleLeitura(req(TOKEN), env, 'livre-das-dividas')).status).toBe(503);
  });
});
