// Entrega de livros do forge: arquivos copiados pro Storage do site (nunca
// apontando pro forge) e autoria vinda do brief, sem nome padrão.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { handleForgeDelivery } from '../src/routes/forge-webhook';
import { catalogoInputSchema } from '../src/routes/admin-catalog';
import type { Env } from '../src/types';

const ID = '11111111-2222-3333-4444-555555555555';
const env = {
  SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'k',
  FORGE_WEBHOOK_SECRET: 'wh', FORGE_DOWNLOAD_SECRET: 'dl',
} as Env;

async function assinado(body: string): Promise<Request> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('wh'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return new Request('https://site.test/api/webhook/forge-delivery', { method: 'POST', body, headers: { 'X-Webhook-Signature': `sha256=${hex}` } });
}

afterEach(() => vi.unstubAllGlobals());

describe('webhook do forge', () => {
  it('copia EPUB e PDF pro bucket ebooks e grava caminhos, título e autor do pacote', async () => {
    const chamadas: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url, init });
      if (url.startsWith('https://tr3vo-forge')) return new Response(url.includes('/epub?') ? 'EPUB' : 'PDF');
      if (url.includes('/storage/v1/object/ebooks/')) return new Response('{}');
      if (init?.method === 'PATCH') return new Response('[]'); // produto ainda não existe
      return new Response('[{}]', { status: 201 });
    }));
    const pkg = {
      projectId: ID, status: 'complete', summary: 'Obra "Velho" — 8 capítulos', timestamp: new Date().toISOString(),
      titulo: 'Título Novo', autor: 'Maria Souza',
      arquivos: [`epub/${ID}/titulo.epub`, `pdf/${ID}/titulo.pdf`, `html/${ID}/index.html`],
    };
    const r = await handleForgeDelivery(await assinado(JSON.stringify(pkg)), env);
    expect(await r.json()).toMatchObject({ ok: true, semArquivo: false });

    // O forge foi lido com link assinado; nada de URL do forge gravada no produto.
    expect(chamadas.filter((c) => c.url.startsWith('https://tr3vo-forge')).every((c) => /\?exp=\d+&sig=/.test(c.url))).toBe(true);
    expect(chamadas.map((c) => c.url)).toContain('https://sb.test/storage/v1/object/ebooks/forge-11111111.epub');
    const produto = JSON.parse(String(chamadas.find((c) => c.url.endsWith('/rest/v1/products'))!.init!.body));
    expect(produto).toMatchObject({
      slug: 'forge-11111111', titulo: 'Título Novo', autor: 'Maria Souza',
      epub_url: 'forge-11111111.epub', arquivo_url: 'forge-11111111.pdf', ativo: false,
    });
  });

  it('sem arquivo copiável: rascunho sem arquivo, autor nulo (nunca um nome padrão)', async () => {
    const chamadas: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url, init });
      if (url.startsWith('https://tr3vo-forge')) return new Response('x', { status: 401 });
      if (init?.method === 'PATCH') return new Response('[]');
      return new Response('[{}]', { status: 201 });
    }));
    const pkg = { projectId: ID, status: 'complete', summary: 'Obra "A"', timestamp: '', arquivos: [`epub/${ID}/a.epub`] };
    const r = await handleForgeDelivery(await assinado(JSON.stringify(pkg)), env);
    expect(await r.json()).toMatchObject({ ok: true, semArquivo: true });
    const produto = JSON.parse(String(chamadas.find((c) => c.url.endsWith('/rest/v1/products'))!.init!.body));
    expect(produto).toMatchObject({ titulo: 'A', autor: null, epub_url: null, arquivo_url: null });
  });
});

describe('webhook do forge — nova edição', () => {
  it('produto já existe: atualiza arquivos, título e autor, sem tocar em preço/ativação nem duplicar', async () => {
    const chamadas: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      chamadas.push({ url, init });
      if (url.startsWith('https://tr3vo-forge')) return url.includes('/pdf?') ? new Response('x', { status: 404 }) : new Response('EPUB');
      if (url.includes('/storage/v1/object/ebooks/')) return new Response('{}');
      if (init?.method === 'PATCH') return new Response('[{"slug":"forge-11111111"}]');
      throw new Error('não deveria criar produto');
    }));
    const pkg = { projectId: ID, status: 'complete', summary: '', timestamp: '', titulo: 'T', autor: 'Novo Autor', arquivos: [`epub/${ID}/t.epub`, `pdf/${ID}/t.pdf`] };
    const r = await handleForgeDelivery(await assinado(JSON.stringify(pkg)), env);
    expect(await r.json()).toMatchObject({ ok: true, atualizado: true });
    const patch = JSON.parse(String(chamadas.find((c) => c.init?.method === 'PATCH')!.init!.body));
    // PDF não copiado desta vez: arquivo_url anterior é mantido (chave ausente).
    expect(patch).toEqual({ titulo: 'T', autor: 'Novo Autor', epub_url: 'forge-11111111.epub' });
  });
});

describe('autoria no catálogo', () => {
  it('rejeita autor vazio', () => {
    expect(catalogoInputSchema.safeParse({ slug: 'x-y', titulo: 'X', autor: '  ' }).success).toBe(false);
    expect(catalogoInputSchema.safeParse({ slug: 'x-y', titulo: 'X', autor: 'Maria Souza' }).success).toBe(true);
  });
});
