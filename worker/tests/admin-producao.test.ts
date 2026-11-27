import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleAdminProducao, resumirExecucao, ESPERAS_MS } from '../src/routes/admin-producao';
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
        : url.includes('narrar-obra')
          ? [run({ id: 3, display_title: 'Narrar · livre-das-dividas · publicar', path: '.github/workflows/narrar-obra.yml', created_at: '2026-11-26T11:00:00Z', status: 'in_progress', conclusion: null })]
          : [],
    })));
    const r = await chamar(req('GET', 'execucoes?slug=livre-das-dividas'));
    const { execucoes } = await r.json() as { execucoes: { id: number; etapa: string; publicar: boolean }[] };
    expect(execucoes.map((e) => e.id)).toEqual([3, 1]);
    expect(execucoes[0]).toMatchObject({ etapa: 'narrar', publicar: true });
  });

  it('obras: lê obras.json e o perfil do tipo em perfis.json', async () => {
    const manual = { rotulo: 'Manual / guia prático', ilustracao: { densidade: 'diagrama' } };
    mockFetch((url) => new Response(JSON.stringify(url.includes('perfis.json')
      ? { versao: 1, tipos: { manual } }
      : { 'livre-das-dividas': { tipo: 'manual', perfil_ajustes: { impressao: { trim: '5.5x8.5' } }, ficha: { titulo: 'Livre das Dívidas', autor: 'Said Anes', edicao: '2026-11' } } })));
    const r = await chamar(req('GET', 'obras'));
    expect(await r.json()).toEqual({ ok: true, obras: [{
      slug: 'livre-das-dividas', titulo: 'Livre das Dívidas', autor: 'Said Anes', edicao: '2026-11',
      tipo: 'manual', classificacao: null, perfil: manual, ajustes: { impressao: { trim: '5.5x8.5' } },
    }] });
  });

  it('obras: o tipo vem da classificação oficial (forma e, quando pede, registro)', async () => {
    const tax = {
      formas: {
        'narrativa-infantojuvenil': { rotulo: 'Narrativa infantojuvenil em capítulos', perfil: 'infantojuvenil' },
        romance: { rotulo: 'Romance', perfil_por_registro: { descritivo: 'ficcao-descritiva', leve: 'ficcao-leve' } },
      },
      niveis_leitor: { 'leitor-iniciante': { rotulo: 'Leitor iniciante (6 e 7 anos)' } },
    };
    const infantojuvenil = { rotulo: 'Narrativa infantojuvenil em capítulos' };
    mockFetch((url) => new Response(JSON.stringify(
      url.includes('perfis.json') ? { tipos: { infantojuvenil, 'ficcao-leve': { rotulo: 'Ficção leve' } } }
      : url.includes('classificacao.json') ? tax
      : {
        'isa-isma-tintim': { classificacao: { forma: 'narrativa-infantojuvenil', nivel_leitor: 'leitor-iniciante', cdd: '028.5', thema: ['YFN'], bisac: ['JUV013000'] }, ficha: { titulo: 'Isa, Isma e Tintim' } },
        'romance-sem-registro': { classificacao: { forma: 'romance', nivel_leitor: 'adulto' }, ficha: { titulo: 'R' } },
        'nao-classificada': { ficha: { titulo: 'N' } },
      })));
    const { obras } = await (await chamar(req('GET', 'obras'))).json() as any;
    expect(obras[0]).toMatchObject({
      tipo: 'infantojuvenil', perfil: infantojuvenil,
      classificacao: { forma_rotulo: 'Narrativa infantojuvenil em capítulos', nivel_rotulo: 'Leitor iniciante (6 e 7 anos)', cdd: '028.5', thema: ['YFN'] },
    });
    expect(obras[1]).toMatchObject({ tipo: null, perfil: null });       // romance sem registro: P0 do Forge reprova
    expect(obras[2]).toMatchObject({ tipo: null, classificacao: null }); // aguardando "Classificar obra"
  });

  it('classificar: dispara classificar-obra.yml só com o slug; não publica', async () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    expect((await chamar(req('POST', 'disparar', { slug: 'isa-isma-tintim', etapa: 'classificar' }))).status).toBe(202);
    const [url, init] = chamadasGithub(f)[0] as [string, RequestInit];
    expect(url).toContain('/classificar-obra.yml/dispatches');
    expect(JSON.parse(init.body as string).inputs).toEqual({ slug: 'isa-isma-tintim' });
    expect((await chamar(req('POST', 'disparar', { slug: 'x', etapa: 'classificar', publicar: true }))).status).toBe(400);
  });

  it('obras: sem perfis.json no repositório, a lista continua e o perfil fica vazio', async () => {
    mockFetch((url) => url.includes('perfis.json')
      ? new Response('{}', { status: 404 })
      : new Response(JSON.stringify({ 'x': { ficha: { titulo: 'X' } } })));
    const r = await chamar(req('GET', 'obras'));
    expect((await r.json() as any).obras[0]).toMatchObject({ slug: 'x', tipo: null, perfil: null });
  });

  it('leitura tenta de novo em falha passageira; disparo não repete (evita execução em dobro)', async () => {
    const originais = [...ESPERAS_MS];
    ESPERAS_MS.splice(0, ESPERAS_MS.length, 1, 1); // espera curta no teste
    try {
      let n = 0;
      const f = mockFetch(() => (++n < 3 ? new Response('', { status: 502 }) : new Response(JSON.stringify({ workflow_runs: [] }))));
      expect((await chamar(req('GET', 'execucoes'))).status).toBe(200);
      expect(chamadasGithub(f).length).toBeGreaterThanOrEqual(3);

      const g = mockFetch(() => new Response('', { status: 502 }));
      expect((await chamar(req('POST', 'disparar', { slug: 'x', etapa: 'compor' }))).status).toBe(502);
      expect(chamadasGithub(g)).toHaveLength(1);
    } finally {
      ESPERAS_MS.splice(0, ESPERAS_MS.length, ...originais);
    }
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

describe('ilustração: disparo e galeria de aprovação', () => {
  const SHA_A = 'a'.repeat(64), SHA_B = 'b'.repeat(64);
  const manifest = { slug: 'obra', modelo_imagem: 'gemini-2.5-flash-image', imagens: [
    { id: 'joana', tipo: 'folha', arquivo: 'joana.jpg', sha256: SHA_A },
    { id: 'cap1-1', tipo: 'cena', arquivo: 'cap1-1.jpg', sha256: SHA_B, capitulo: 'cap1', cena: 'Joana na cozinha.', alt: 'Joana' },
  ] };

  // Storage simulado: guarda o que for gravado para conferir depois.
  function mockStorage(inicial: Record<string, unknown>) {
    const gravado: Record<string, any> = {};
    const f = mockFetch((url, init) => {
      if (url.includes('/storage/v1/object/sign/media')) {
        const { paths } = JSON.parse(init!.body as string);
        return new Response(JSON.stringify(paths.map((p: string) => ({ path: p, signedURL: `/object/sign/media/${p}?token=t` }))));
      }
      const m = url.match(/\/storage\/v1\/object\/media\/ilustracoes\/obra\/(.+)$/);
      if (m && init?.method === 'POST') { gravado[m[1]] = JSON.parse(init.body as string); return new Response('{}'); }
      if (m) return m[1] in inicial ? new Response(JSON.stringify(inicial[m[1]])) : new Response('{"error":"not_found"}', { status: 400 });
      return new Response(null, { status: 204 });
    });
    return { f, gravado };
  }

  it('dispara ilustrar-obra.yml com a fase e os itens; ilustrar nunca publica', async () => {
    const f = mockFetch(() => new Response(null, { status: 204 }));
    expect((await chamar(req('POST', 'disparar', { slug: 'obra', etapa: 'ilustrar', fase: 'cenas', itens: 'cap1-1,cap2-1' }))).status).toBe(202);
    const [url, init] = chamadasGithub(f)[0] as [string, RequestInit];
    expect(url).toContain('/ilustrar-obra.yml/dispatches');
    expect(JSON.parse(init.body as string).inputs).toEqual({ slug: 'obra', etapa: 'cenas', itens: 'cap1-1,cap2-1' });
    for (const corpo of [
      { slug: 'obra', etapa: 'ilustrar' },                                  // sem fase
      { slug: 'obra', etapa: 'ilustrar', fase: 'folhas', publicar: true },  // ilustrar não publica
      { slug: 'obra', etapa: 'ilustrar', fase: 'folhas', itens: 'cap1-1' }, // itens só nas cenas
      { slug: 'obra', etapa: 'compor', fase: 'cenas' },
    ]) expect((await chamar(req('POST', 'disparar', corpo))).status).toBe(400);
  });

  it('galeria: links assinados e decisão só vale para o mesmo sha256', async () => {
    mockStorage({
      'manifest-ilustracao.json': manifest,
      'aprovacao.json': { decisoes: {
        'folha:joana': { decisao: 'aprovada', sha256: SHA_A, quando: 'x' },
        'cena:cap1-1': { decisao: 'aprovada', sha256: 'c'.repeat(64), quando: 'x' }, // versão antiga
      } },
    });
    const r = await chamar(req('GET', 'ilustracoes?slug=obra'), { ...env, GH_PRODUCAO_TOKEN: undefined });
    const d = await r.json() as any;
    expect(r.status).toBe(200);
    expect(d.imagens.map((i: any) => [i.id, i.decisao])).toEqual([['joana', 'aprovada'], ['cap1-1', 'pendente']]);
    expect(d.imagens[0].url).toBe('https://sb.test/storage/v1/object/sign/media/ilustracoes/obra/folhas/joana.jpg?token=t');
    expect(d.imagens[1].url).toContain('/cenas/cap1-1.jpg');
  });

  it('obra sem ilustrações ainda: galeria vazia, sem erro', async () => {
    mockStorage({});
    const d = await (await chamar(req('GET', 'ilustracoes?slug=obra'))).json() as any;
    expect(d).toMatchObject({ ok: true, imagens: [], plano: null });
  });

  it('decidir grava aprovacao.json com o sha256 e a nota', async () => {
    const { gravado } = mockStorage({ 'manifest-ilustracao.json': manifest });
    const r = await chamar(req('POST', 'ilustracoes/decidir', { slug: 'obra', tipo: 'cena', id: 'cap1-1', sha256: SHA_B, decisao: 'rejeitada', nota: 'mão com seis dedos' }));
    expect(r.status).toBe(200);
    expect(gravado['aprovacao.json'].decisoes['cena:cap1-1']).toMatchObject({ decisao: 'rejeitada', sha256: SHA_B, nota: 'mão com seis dedos' });
  });

  it('decidir sobre imagem já refeita (outro sha) ou inexistente é recusado', async () => {
    const { gravado } = mockStorage({ 'manifest-ilustracao.json': manifest });
    expect((await chamar(req('POST', 'ilustracoes/decidir', { slug: 'obra', tipo: 'cena', id: 'cap1-1', sha256: SHA_A, decisao: 'aprovada' }))).status).toBe(409);
    expect((await chamar(req('POST', 'ilustracoes/decidir', { slug: 'obra', tipo: 'cena', id: 'cap9-1', sha256: SHA_A, decisao: 'aprovada' }))).status).toBe(404);
    expect((await chamar(req('POST', 'ilustracoes/decidir', { slug: '../x', tipo: 'cena', id: 'cap1-1', sha256: SHA_A, decisao: 'aprovada' }))).status).toBe(400);
    expect(gravado).toEqual({});
  });

  it('execução do ilustrar mostra a fase', () => {
    const e = resumirExecucao(run({ display_title: 'Ilustrar · obra · folhas', path: '.github/workflows/ilustrar-obra.yml' }) as any);
    expect(e).toMatchObject({ etapa: 'ilustrar', slug: 'obra', fase: 'folhas', publicar: false });
  });
});
