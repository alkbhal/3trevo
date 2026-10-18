/**
 * forge-webhook.ts — Três Trevo Worker
 * Recebe o webhook HMAC-assinado do tr3vo-forge quando um livro completa
 * e cria o produto (rascunho, ativo=false) na tabela `products`, com EPUB/PDF
 * copiados pro Storage do site (nunca apontando pro forge).
 *
 * POST /api/webhook/forge-delivery
 * GET  /api/admin/forge/links            — links assinados pra revisão no admin
 * POST /api/admin/forge/arquivos         — copia EPUB/PDF pra loja ou biblioteca
 */

import type { Env } from '../types';
import { sb } from '../sb';
import { assinarForge, copiarParaStorage, copiarEpubParaBiblioteca } from '../forge-download';
import { verificarToken } from './admin-catalog';

interface DeliveryPackage {
  projectId: string;
  status: string; // 'complete' | 'awaiting_character_images'
  arquivos: string[];
  summary: string;
  timestamp: string;
  titulo?: string;
  autor?: string;
  editora?: string;
}

// ponytail: comparação hex constant-time duplicada em checkout.ts — sem util
// compartilhado pra 2 call sites, per CLAUDE.md ("prefer editing existing files")
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function assinaturaValida(body: string, sigHeader: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = `sha256=${[...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  return timingSafeEqualHex(sigHeader, expected);
}

export async function handleForgeDelivery(request: Request, env: Env): Promise<Response> {
  if (!env.FORGE_WEBHOOK_SECRET) {
    console.error('[forge-webhook] FORGE_WEBHOOK_SECRET ausente — rejeitando');
    return new Response('Service Unavailable', { status: 503 });
  }

  const body = await request.text();
  const sigHeader = request.headers.get('X-Webhook-Signature') ?? '';
  if (!(await assinaturaValida(body, sigHeader, env.FORGE_WEBHOOK_SECRET))) {
    return new Response('Unauthorized', { status: 401 });
  }

  let pkg: DeliveryPackage;
  try { pkg = JSON.parse(body); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }

  if (pkg.status !== 'complete') {
    return Response.json({ ok: true, ignorado: pkg.status });
  }

  if (!/^[0-9a-f-]{36}$/i.test(pkg.projectId ?? '')) {
    return Response.json({ ok: false, erro: 'projectId_invalido' }, { status: 400 });
  }
  const projectId = pkg.projectId.toLowerCase();
  const slug = `forge-${projectId.slice(0, 8)}`;

  // Formatos de venda: EPUB e PDF, copiados pro Storage. HTML fica fora da venda.
  const formatos = (['epub', 'pdf'] as const).filter((f) => pkg.arquivos.some((a) => a.startsWith(`${f}/${pkg.projectId}/`)));
  const copiados = await copiarParaStorage(env, projectId, slug, [...formatos]);
  const semArquivo = !copiados.epub && !copiados.pdf;
  if (semArquivo) console.warn(`[forge-webhook] sem EPUB nem PDF copiados para ${projectId}: rascunho sem arquivo de venda`);

  // Título e autor vêm do pacote (brief do forge); regex no summary só pra pacote antigo.
  const titulo = pkg.titulo?.trim() || pkg.summary.match(/^Obra "(.+?)"/)?.[1] || `Forge ${projectId.slice(0, 8)}`;
  const autor = pkg.autor?.trim() || null;
  if (!autor) console.warn(`[forge-webhook] ${projectId} sem autor no brief — preencher no admin antes de ativar`);

  // Portão humano: cria como rascunho (ativo=false, preço placeholder).
  // Precificação real e ativação ficam pro admin, via /api/admin/catalogo já existente.
  const r = await sb(env, 'products', {
    method: 'POST',
    headers: { Prefer: 'return=representation' } as any,
    body: JSON.stringify({
      slug,
      tipo: 'ebook',
      titulo,
      autor,
      descricao: pkg.summary,
      preco: 0,
      ativo: false,
      epub_url: copiados.epub ?? null,
      arquivo_url: copiados.pdf ?? null,
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    console.error('[forge-webhook] supabase error:', r.status, err);
    return Response.json({ ok: false, erro: 'supabase_error' }, { status: 502 });
  }

  console.log(`[forge-webhook] produto rascunho criado: ${slug} (projeto ${pkg.projectId})`);
  return Response.json({ ok: true, slug, projectId: pkg.projectId, semArquivo });
}

/**
 * GET /api/admin/forge/links?projectId=X — links assinados (15 min) de HTML/EPUB/PDF
 * pra revisão no admin. O forge não abre mais esses arquivos sem assinatura.
 */
export async function handleAdminForgeLinks(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return Response.json({ ok: false, erro: 'unauthorized' }, { status: 401 });
  const projectId = (new URL(request.url).searchParams.get('projectId') ?? '').toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(projectId)) return Response.json({ ok: false, erro: 'projectId_invalido' }, { status: 400 });
  const [html, epub, pdf] = await Promise.all(
    (['html', 'epub', 'pdf'] as const).map((f) => assinarForge(env, projectId, f))
  );
  if (!html || !epub || !pdf) return Response.json({ ok: false, erro: 'forge_download_secret_ausente' }, { status: 503 });
  return Response.json({ ok: true, html, epub, pdf });
}

/**
 * POST /api/admin/forge/arquivos { projectId, slug, destino: 'loja' | 'biblioteca' }
 * loja: copia EPUB/PDF pro Storage e grava em products (slug já criado pelo catálogo).
 * biblioteca: copia o EPUB pro R2 da Biblioteca TT e devolve a chave pro acervo.
 */
export async function handleAdminForgeArquivos(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return Response.json({ ok: false, erro: 'unauthorized' }, { status: 401 });
  let body: { projectId?: unknown; slug?: unknown; destino?: unknown };
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }
  const projectId = typeof body.projectId === 'string' ? body.projectId.toLowerCase() : '';
  const slug = typeof body.slug === 'string' ? body.slug : '';
  if (!/^[0-9a-f-]{36}$/.test(projectId)) return Response.json({ ok: false, erro: 'projectId_invalido' }, { status: 400 });
  if (!/^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/.test(slug)) return Response.json({ ok: false, erro: 'slug_invalido' }, { status: 400 });

  if (body.destino === 'biblioteca') {
    const epub_url = await copiarEpubParaBiblioteca(env, projectId, slug);
    if (!epub_url) return Response.json({ ok: false, erro: 'copia_falhou' }, { status: 502 });
    return Response.json({ ok: true, epub_url });
  }
  if (body.destino !== 'loja') return Response.json({ ok: false, erro: 'destino_invalido' }, { status: 400 });

  const copiados = await copiarParaStorage(env, projectId, slug);
  if (!copiados.epub && !copiados.pdf) return Response.json({ ok: false, erro: 'copia_falhou' }, { status: 502 });
  const r = await sb(env, `products?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' } as any,
    body: JSON.stringify({ epub_url: copiados.epub ?? null, arquivo_url: copiados.pdf ?? null }),
  });
  const linhas = r.ok ? await r.json().catch(() => []) : [];
  if (!Array.isArray(linhas) || !linhas.length) return Response.json({ ok: false, erro: 'produto_nao_encontrado' }, { status: 404 });
  return Response.json({ ok: true, ...copiados });
}
