import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleAdminProducao, resumirExecucao } from '../src/routes/admin-producao';
import worker from '../src/index';

const env = { SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'k', GH_PRODUCAO_TOKEN: 'gh-token' } as any;

// Sessão de admin válida no Supabase; qualquer outra URL é o GitHub e cai em `gh`.
function mockFetch(gh: (url: string, init?: RequestInit) => Response, sessaoValida = true) {
  const f = vi.fn(async (url: string, init?: RequestInit) =>
    url.includes('admin_sessoes')
      ? new Response(JSON.stringify(sessaoValida ? [{ expira_em: new Date(Date.now() + 3_600_000).toISOString() }] : []))
      : gh(url, init));
  vi.stubGlobal('fetch', f);
  return f;
}
const req = (metodo: string, caminho: string, corpo?: unknown) =>
  new Request(`https://x.test/api/admin/producao/${caminho}`, {
    method: metodo,
    headers: { Authorization: 'Bearer t' },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
const chamar = (r: Request, e = env) => handleAdminProducao(r, e, new URL(r.url).pathname);
const chamadasGithub = (f: ReturnType<typeof mockFetch>) =>
  f.mock.calls.filter((c) => !(c[0] as string).includes('admin_sessoes'));

const run = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1, name: 'Compor obra', display_title: 'Compor · livre-das-dividas', status: 'completed', conclusion: 'success',
  html_url: 'https://github.com/alkbhal/tr3vo-forge/actions/runs/1', created_at: '2026-11-26T10:00:00Z',
  updated_at: '2026-11-26T10:05:00Z', path: '.github/workflows/compor-obra.yml', ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe('produção: disparar workflows do tr3vo-forge', () => {
  it('sem sessão de admin: 401 e nada chega ao GitHub', async () => {
    const f = mockFetch(() => new Response(null, { status: 204 }), false);
    const r = await chamar(req('POST', 'disparar', { slug: 'livre-das-dividas', etapa: 'compor' }));
    expect(r.status).toBe(401);
    expect(chamadasGithub(f)).toHaveLength(0);
  });

  it('sem token do GitHub configurado: 503 claro', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    const r = await chamar(req('GET', 'obras'), { ...env, GH_PRODUCAO_TOKEN: undefined });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ erro: 'github_token_ausente' });
  });

  it('compor só para conferir: dispara compor-obra.yml em main com publicar vazio', async () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    const r = await chamar(req('POST', 'disparar', { slug: 'livre-das-dividas', etapa: 'compor' }));
    expect(r.status).toBe(202);
    const [url, init] = chamadasGithub(f)[0] as [string, RequestInit];
    expect(url).toBe('https://api.github.com/repos/alkbhal/tr3vo-forge/actions/workflows/compor-obra.yml/dispatches');
    expect(JSON.parse(init.body as string)).toEqual({ ref: 'main', inputs: { slug: 'livre-das-dividas', publicar: '' } });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer gh-token');
  });

  it('narrar e publicar: manda PUBLICAR e os capítulos', async () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    await chamar(req('POST', 'disparar', { slug: 'livre-das-dividas', etapa: 'narrar', publicar: true, capitulos: 'prefacio,cap1' }));
    const [url, init] = chamadasGithub(f)[0] as [string, RequestInit];
    expect(url).toContain('/narrar-obra.yml/dispatches');
    expect(JSON.parse(init.body as string).inputs).toEqual({ slug: 'livre-das-dividas', publicar: 'PUBLICAR', capitulos: 'prefacio,cap1' });
  });

  it('entrada fora do esperado é barrada antes do GitHub', async () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    for (const corpo of [
      { slug: '../x', etapa: 'compor' },
      { slug: 'ok', etapa: 'publicar-tudo' },
      { slug: 'ok', etapa: 'compor', capitulos: 'cap1' },
      { slug: 'ok', etapa: 'narrar', capitulos: 'cap1;rm -rf' },
    ]) {
      expect((await chamar(req('POST', 'disparar', corpo))).status).toBe(400);
    }
    expect(chamadasGithub(f)).toHaveLength(0);
  });

  it('erro do GitHub vira código curto, sem repassar a mensagem dele', async () => {
    mockFetch(() => new Response(JSON.stringify({ message: 'Bad credentials gh-token' }), { status: 401 }));
    const r = await chamar(req('POST', 'disparar', { slug: 'x', etapa: 'compor' }));
    expect(r.status).toBe(502);
    const corpo = await r.text();
    expect(corpo).toContain('github_token_invalido');
    expect(corpo).not.toContain('gh-token');
  });

  it('execuções: junta os dois workflows, filtra pela obra e ordena da mais nova', async () => {
    mockFetch((url) => new Response(JSON.stringify({
      workflow_runs: url.includes('compor-obra')
        ? [run(), run({ id: 2, display_title: 'Compor · outra-obra' })]
        : [run({ id: 3, display_title: 'Narrar · livre-das-dividas · publicar', path: '.github/workflows/narrar-obra.yml', created_at: '2026-11-26T11:00:00Z', status: 'in_progress', conclusion: null })],
    })));
    const r = await chamar(req('GET', 'execucoes?slug=livre-das-dividas'));
    const { execucoes } = await r.json() as { execucoes: { id: number; etapa: string; publicar: boolean }[] };
    expect(execucoes.map((e) => e.id)).toEqual([3, 1]);
    expect(execucoes[0]).toMatchObject({ etapa: 'narrar', publicar: true });
  });

  it('obras: lê scripts/obras/obras.json do repositório', async () => {
    mockFetch(() => new Response(JSON.stringify({ 'livre-das-dividas': { ficha: { titulo: 'Livre das Dívidas', autor: 'Said Anes', edicao: '2026-11' } } })));
    const r = await chamar(req('GET', 'obras'));
    expect(await r.json()).toEqual({ ok: true, obras: [{ slug: 'livre-das-dividas', titulo: 'Livre das Dívidas', autor: 'Said Anes', edicao: '2026-11' }] });
  });

  it('execução antiga, sem run-name, fica sem slug', () => {
    expect(resumirExecucao(run({ display_title: 'Compor obra' }) as any).slug).toBeNull();
  });
});

describe('portão central do /api/admin/*', () => {
  it('rota admin sem sessão é recusada pelo roteador', async () => {
    mockFetch(() => new Response('{}'), false);
    const r = await worker.fetch(new Request('https://x.test/api/admin/catalogo', { headers: { Authorization: 'Bearer t' } }), env);
    expect(r.status).toBe(401);
  });

  it('login continua acessível sem sessão (não passa pelo portão)', async () => {
    const f = mockFetch(() => new Response('[]'), false);
    const r = await worker.fetch(new Request('https://x.test/api/admin/login', { method: 'POST', body: '{}' }), env);
    expect(r.status).not.toBe(401);
    expect(f.mock.calls.some((c) => (c[0] as string).includes('admin_sessoes?token_hash'))).toBe(false);
  });

  it('com sessão válida, a sessão é consultada uma vez só por requisição', async () => {
    const f = mockFetch(() => new Response('[]'));
    await worker.fetch(new Request('https://x.test/api/admin/producao/obras', { headers: { Authorization: 'Bearer t' } }), env);
    expect(f.mock.calls.filter((c) => (c[0] as string).includes('admin_sessoes')).length).toBe(1);
  });

  it('logout desativa a sessão no servidor', async () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    const r = await worker.fetch(new Request('https://x.test/api/admin/logout', { method: 'POST', headers: { Authorization: 'Bearer t' } }), env);
    expect(r.status).toBe(200);
    const patch = f.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'PATCH')!;
    expect(patch[0]).toContain('admin_sessoes?token_hash=eq.');
    expect(JSON.parse((patch[1] as RequestInit).body as string)).toEqual({ ativa: false });
  });
});
