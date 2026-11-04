import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleAticoAcesso } from '../src/routes/atico';

const TOKEN = 'a'.repeat(40);
const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'svc' } as any;
const req = (token?: string) =>
  new Request('https://api.test/api/atico/acesso', { headers: token ? { Authorization: `Bearer ${token}` } : {} });

function mockFetch(opts: { user?: boolean; linhas?: unknown[]; biblioteca?: number }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/auth/v1/user')) {
      return opts.user === false
        ? new Response('no', { status: 401 })
        : Response.json({ id: 'u1', email: 'a@b.c' });
    }
    if (url.includes('/rest/v1/user_library')) {
      return new Response(JSON.stringify(opts.linhas ?? []), { status: opts.biblioteca ?? 200 });
    }
    return new Response('?', { status: 500 });
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('handleAticoAcesso', () => {
  it('sem login: 401', async () => {
    mockFetch({});
    const r = await handleAticoAcesso(req(), env);
    expect(r.status).toBe(401);
  });

  it('token inválido: 401', async () => {
    mockFetch({ user: false });
    const r = await handleAticoAcesso(req(TOKEN), env);
    expect(r.status).toBe(401);
  });

  it('comprou: acesso true', async () => {
    mockFetch({ linhas: [{ product_id: 'p1', products: { slug: 'atico-plano' } }] });
    const r = await handleAticoAcesso(req(TOKEN), env);
    expect(await r.json()).toEqual({ ok: true, acesso: true });
  });

  it('não comprou: acesso false', async () => {
    mockFetch({ linhas: [] });
    const r = await handleAticoAcesso(req(TOKEN), env);
    expect(await r.json()).toEqual({ ok: true, acesso: false });
  });

  it('banco fora do ar: 503, nunca acesso liberado', async () => {
    mockFetch({ biblioteca: 500 });
    const r = await handleAticoAcesso(req(TOKEN), env);
    expect(r.status).toBe(503);
    expect((await r.json() as any).acesso).toBeUndefined();
  });
});
