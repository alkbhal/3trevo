import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleAdminForge } from '../src/routes/admin-forge';

const ID = '123e4567-e89b-12d3-a456-426614174000';
const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'k', FORGE_ADMIN_SECRET: 'segredo-forge' } as any;

// Sessão de admin válida no Supabase; qualquer outra URL é o Forge e cai em `forge`.
function mockFetch(forge: (url: string, init?: RequestInit) => Response) {
  const f = vi.fn(async (url: string, init?: RequestInit) =>
    url.includes('admin_sessoes')
      ? new Response(JSON.stringify([{ expira_em: new Date(Date.now() + 3_600_000).toISOString() }]))
      : forge(url, init));
  vi.stubGlobal('fetch', f);
  return f;
}
const req = (metodo: string, caminho: string, corpo?: unknown) =>
  new Request(`https://x.test/api/admin/forge/${caminho}`, {
    method: metodo,
    headers: { Authorization: 'Bearer t' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
const chamar = (r: Request) => handleAdminForge(r, env, new URL(r.url).pathname);

afterEach(() => vi.unstubAllGlobals());

describe('ponte admin → forge', () => {
  it('recusa sem sessão de admin', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]')));
    const r = await chamar(new Request('https://x.test/api/admin/forge/projetos'));
    expect(r.status).toBe(401);
  });

  it('rota fora da lista fechada dá 404 e não chama o Forge', async () => {
    const f = mockFetch(() => new Response('{}'));
    expect((await chamar(req('GET', 'qualquer-coisa'))).status).toBe(404);
    expect(f).toHaveBeenCalledTimes(1); // só a checagem de sessão
  });

  it('id que não é UUID dá 400', async () => {
    mockFetch(() => new Response('{}'));
    expect((await chamar(req('POST', 'retry/not-a-uuid'))).status).toBe(400);
  });

  it('manuscrito curto demais dá 400 antes de chamar o Forge', async () => {
    const f = mockFetch(() => new Response('{}'));
    const r = await chamar(req('POST', 'ingerir', { manuscrito: 'curto' }));
    expect(r.status).toBe(400);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('manuscrito com formato: repassa o formato ao Forge', async () => {
    const f = mockFetch(() => new Response(JSON.stringify({ projectId: ID }), { status: 201 }));
    const r = await chamar(req('POST', 'ingerir', { manuscrito: 'palavra '.repeat(60), formato: 'novela' }));
    expect(r.status).toBe(201);
    const [url, init] = f.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://tr3vo-forge.al-kbhal.workers.dev/ingest');
    expect(JSON.parse(init.body as string)).toMatchObject({ formato: 'novela' });
  });

  it('tema com formato: repassa o formato ao Forge', async () => {
    const f = mockFetch(() => new Response(JSON.stringify({ projectId: ID }), { status: 201 }));
    await chamar(req('POST', 'novo', { tema: 'Endividamento das famílias', formato: 'artigo-academico' }));
    const [, init] = f.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({ tema: 'Endividamento das famílias', formato: 'artigo-academico' });
  });

  it('GET formatos: repassa ao Forge, que é a fonte única da tabela', async () => {
    const lista = [{ id: 'novela', descricao: 'Novela · …' }];
    const f = mockFetch(() => new Response(JSON.stringify(lista)));
    const r = await chamar(req('GET', 'formatos'));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(lista);
    expect((f.mock.calls[1] as [string])[0]).toBe('https://tr3vo-forge.al-kbhal.workers.dev/formatos');
  });

  it('formato com caracteres estranhos dá 400 antes de chamar o Forge', async () => {
    const f = mockFetch(() => new Response('{}'));
    const r = await chamar(req('POST', 'novo', { tema: 'Qualquer tema', formato: 'Cordel!!<x>' }));
    expect(r.status).toBe(400);
    expect(f).toHaveBeenCalledTimes(1); // só a checagem de sessão
  });

  it('formato bem formado mas desconhecido: quem decide é o Forge, e o 400 dele é repassado', async () => {
    mockFetch(() => new Response(JSON.stringify({ error: 'formato inválido (use: ensaio, novela, artigo-academico)' }), { status: 400 }));
    const r = await chamar(req('POST', 'novo', { tema: 'Qualquer tema', formato: 'cordel' }));
    expect(r.status).toBe(400);
    expect(JSON.stringify(await r.json())).toContain('formato inválido');
  });

  it('repassa o segredo ao Forge e devolve o JSON dele', async () => {
    const f = mockFetch(() => new Response(JSON.stringify([{ id: ID, tema: 't', status: 'complete' }])));
    const r = await chamar(req('GET', 'projetos'));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([{ id: ID, tema: 't', status: 'complete' }]);
    const [url, init] = f.mock.calls[1] as [string, RequestInit];
    expect(url).toBe('https://tr3vo-forge.al-kbhal.workers.dev/projects?limit=50');
    expect((init.headers as Record<string, string>)['X-Forge-Secret']).toBe('segredo-forge');
  });

  it('401 do Forge vira erro claro, sem vazar o segredo', async () => {
    mockFetch(() => new Response('{"ok":false}', { status: 401 }));
    const r = await chamar(req('GET', `status/${ID}`));
    expect(r.status).toBe(502);
    expect(await r.json()).toEqual({ ok: false, erro: 'forge_nao_autorizado' });
  });

  it('Forge fora do ar dá 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('admin_sessoes')) return new Response(JSON.stringify([{ expira_em: new Date(Date.now() + 3_600_000).toISOString() }]));
      throw new Error('rede');
    }));
    const r = await chamar(req('POST', `retry/${ID}`));
    expect(r.status).toBe(502);
  });
});
