// worker/tests/forge-arquivo.test.ts
// Achado de segurança (13/10/2026): o download de livro do forge fazia 302 para
// https://tr3vo-forge…/project/<id>/epub, rota pública. O comprador via o endereço
// permanente do livro; link repassado = livro de graça. Estes testes rodam os
// handlers reais e exigem: nenhum redirect ao forge, busca no servidor com segredo,
// falha fechada sem segredo, e webhook gravando referência interna.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { referenciaForge, refInterna, entregarArquivoForge } from '../src/forge-arquivo';
import { handleDownload } from '../src/routes/checkout';
import { handleBibliotecaStream } from '../src/routes/biblioteca';
import { handleForgeDelivery } from '../src/routes/forge-webhook';
import type { Env } from '../src/types';

const PID = '5f388d27-fb17-4a19-903d-212723a8b9c0';
const FORGE = 'https://tr3vo-forge.al-kbhal.workers.dev';
const SEGREDO = 'segredo-do-forge';

function forgeBinding() {
  const chamadas: Request[] = [];
  return {
    chamadas,
    fetcher: {
      fetch: vi.fn(async (req: Request) => {
        chamadas.push(req);
        const ok = req.headers.get('X-Forge-Secret') === SEGREDO;
        return ok ? new Response('EPUB-BYTES', { status: 200 }) : new Response('unauthorized', { status: 401 });
      }),
    } as unknown as Fetcher,
  };
}

const envBase = (extra: Partial<Env> = {}) => ({
  SUPABASE_URL: 'https://sb.test', SUPABASE_SERVICE_KEY: 'k', FORGE_PUBLIC_URL: FORGE, ...extra,
}) as unknown as Env;

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('referenciaForge', () => {
  it('reconhece a referência interna e a URL antiga do forge', () => {
    expect(referenciaForge(refInterna(PID, 'epub'), envBase())).toEqual({ projectId: PID, tipo: 'epub' });
    expect(referenciaForge(`${FORGE}/project/${PID}/html`, envBase())).toEqual({ projectId: PID, tipo: 'html' });
  });

  it('não confunde outro domínio, outra rota ou caminho do R2', () => {
    expect(referenciaForge(`https://evil.test/project/${PID}/epub`, envBase())).toBeNull();
    expect(referenciaForge(`${FORGE}/project/${PID}/download`, envBase())).toBeNull();
    expect(referenciaForge('dom-casmurro.epub', envBase())).toBeNull();
    expect(referenciaForge('https://www.gutenberg.org/x.epub', envBase())).toBeNull();
  });
});

describe('entregarArquivoForge', () => {
  it('busca no servidor com o segredo e devolve o conteúdo, sem cache e sem expor o forge', async () => {
    const f = forgeBinding();
    const r = await entregarArquivoForge({ projectId: PID, tipo: 'epub' }, envBase({ FORGE_API_SECRET: SEGREDO, FORGE: f.fetcher }), 'Finanças para Empreendedores');
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('EPUB-BYTES');
    expect(r.headers.get('Location')).toBeNull();
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    expect(r.headers.get('Content-Disposition')).toBe('attachment; filename="Finan_as_para_Empreendedores.epub"');
    expect(f.chamadas[0]!.url).toBe(`https://forge.interno/project/${PID}/epub`);
  });

  it('sem FORGE_API_SECRET: 503, falha fechada — nunca redireciona ao forge', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const f = forgeBinding();
    const r = await entregarArquivoForge({ projectId: PID, tipo: 'epub' }, envBase({ FORGE: f.fetcher }));
    expect(r.status).toBe(503);
    expect(r.headers.get('Location')).toBeNull();
    expect(f.chamadas).toHaveLength(0);
  });

  it('forge recusando (segredo errado) vira 502 sem vazar a resposta dele', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await entregarArquivoForge({ projectId: PID, tipo: 'epub' }, envBase({ FORGE_API_SECRET: 'errado', FORGE: forgeBinding().fetcher }));
    expect(r.status).toBe(502);
    expect(await r.text()).toBe('Arquivo indisponível');
  });
});

describe('handlers reais — o comprador nunca recebe o endereço do forge', () => {
  it('download por e-mail de produto antigo (URL do forge gravada): conteúdo, não 302', async () => {
    const f = forgeBinding();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/rest/v1/downloads')) return Response.json([{ id: 1, product_id: 9, expira_em: '2999-01-01T00:00:00Z' }]);
      if (url.includes('/rpc/increment_download_count')) return Response.json(true);
      if (url.includes('/rest/v1/products')) return Response.json([{ arquivo_url: `${FORGE}/project/${PID}/epub`, titulo: 'Livro' }]);
      throw new Error(`fetch inesperado: ${url}`);
    }));
    const r = await handleDownload(
      new Request('https://api.test/api/download?token=11111111-2222-4333-8444-555555555555'),
      envBase({ FORGE_API_SECRET: SEGREDO, FORGE: f.fetcher }),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('Location')).toBeNull();
    expect(await r.text()).toBe('EPUB-BYTES');
  });

  it('stream da biblioteca com referência interna: conteúdo, não 302', async () => {
    const f = forgeBinding();
    const kv = { get: vi.fn(async () => JSON.stringify({ epub_url: refInterna(PID, 'epub') })) } as unknown as KVNamespace;
    const r = await handleBibliotecaStream(
      new Request('https://api.test/api/biblioteca/stream?t=abc'),
      envBase({ FORGE_API_SECRET: SEGREDO, FORGE: f.fetcher, TT_KV: kv }),
    );
    expect(r.status).toBe(200);
    expect(r.headers.get('Location')).toBeNull();
  });

  it('webhook do forge grava referência interna, nunca a URL pública', async () => {
    const corpos: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      corpos.push(String(init.body)); return new Response('[]', { status: 201 });
    }));
    const pkg = JSON.stringify({ projectId: PID, status: 'complete', arquivos: [`epub/${PID}/livro.epub`], summary: 'Obra "Livro" — 10 capítulos', timestamp: '2026-10-13T00:00:00Z' });
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('wh'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(pkg)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const r = await handleForgeDelivery(
      new Request('https://api.test/api/webhook/forge-delivery', { method: 'POST', body: pkg, headers: { 'X-Webhook-Signature': `sha256=${sig}` } }),
      envBase({ FORGE_WEBHOOK_SECRET: 'wh' }),
    );
    expect(r.status).toBe(200);
    const gravado = JSON.parse(corpos[0]!);
    expect(gravado.arquivo_url).toBe(`forge:${PID}/epub`);
    expect(corpos[0]).not.toContain('workers.dev');
  });
});
