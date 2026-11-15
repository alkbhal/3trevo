import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleLeitura, handleLeituraAudio } from '../src/routes/leitura';

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

describe('GET /api/leitura/:slug/audio', () => {
  const manifest = {
    versao_texto: 'v1',
    faixas: [
      { id: 'cap3', titulo: 'Capítulo 3', arquivo: '04-cap3.mp3', segundos: 600 },
      { id: 'mal', titulo: 'Nome estranho', arquivo: '../../segredo.mp3', segundos: 1 },
    ],
  };
  function mockAudio(o: { user?: boolean; compra?: unknown[]; manifest?: 'ok' | 'nao' | 'erro'; assinar?: number }) {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('/auth/v1/user')) return o.user === false ? new Response('x', { status: 401 }) : Response.json({ id: 'u1', email: 'a@b.c' });
      if (url.includes('/rest/v1/user_library')) return Response.json(o.compra ?? []);
      if (url.includes('/object/media/audiobooks/livre-das-dividas/manifest-audio.json')) {
        if (o.manifest === 'nao') return new Response('nf', { status: 404 });
        if (o.manifest === 'erro') return new Response('x', { status: 500 });
        return Response.json(manifest);
      }
      if (url.includes('/object/sign/media/audiobooks/')) {
        if (o.assinar) return new Response('x', { status: o.assinar });
        return Response.json({ signedURL: '/object/sign/media/' + url.split('/media/')[1] + '?token=t' });
      }
      return new Response('?', { status: 500 });
    }));
    return calls;
  }

  it('sem login: 401 e não assina nada', async () => {
    const calls = mockAudio({ user: false });
    expect((await handleLeituraAudio(req(), env, 'livre-das-dividas')).status).toBe(401);
    expect(calls.some((u) => u.includes('/sign/'))).toBe(false);
  });
  it('logado sem compra: 403 e não toca no áudio', async () => {
    const calls = mockAudio({ compra: [] });
    expect((await handleLeituraAudio(req(TOKEN), env, 'livre-das-dividas')).status).toBe(403);
    expect(calls.some((u) => u.includes('/audiobooks/'))).toBe(false);
  });
  it('obra sem áudio publicado: 404 sem_audio', async () => {
    mockAudio({ compra: [{ product_id: 'p' }], manifest: 'nao' });
    const r = await handleLeituraAudio(req(TOKEN), env, 'livre-das-dividas');
    expect(r.status).toBe(404);
    expect((await r.json() as any).erro).toBe('sem_audio');
  });
  it('comprador: links assinados só para nomes válidos, sem cache público', async () => {
    mockAudio({ compra: [{ product_id: 'p' }] });
    const r = await handleLeituraAudio(req(TOKEN), env, 'livre-das-dividas');
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toContain('no-store');
    const d: any = await r.json();
    expect(d.faixas).toHaveLength(1);
    expect(d.faixas[0].id).toBe('cap3');
    expect(d.faixas[0].url).toContain('/storage/v1/object/sign/media/audiobooks/livre-das-dividas/04-cap3.mp3');
  });
  it('falha ao assinar: 503, sem link parcial', async () => {
    mockAudio({ compra: [{ product_id: 'p' }], assinar: 500 });
    expect((await handleLeituraAudio(req(TOKEN), env, 'livre-das-dividas')).status).toBe(503);
  });
  it('slug desconhecido: 404 sem consultar nada', async () => {
    const calls = mockAudio({ compra: [{ product_id: 'p' }] });
    expect((await handleLeituraAudio(req(TOKEN), env, '3a-guerra')).status).toBe(404);
    expect(calls).toHaveLength(0);
  });
});
