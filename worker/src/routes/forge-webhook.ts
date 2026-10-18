/**
 * forge-webhook.ts — Três Trevo Worker
 * Recebe o webhook HMAC-assinado do tr3vo-forge quando um livro completa
 * e cria o produto (rascunho, ativo=false) na tabela `products`.
 *
 * POST /api/webhook/forge-delivery
 */

import type { Env } from '../types';
import { sb } from '../sb';
import { assinarForge } from '../forge-download';
import { verificarToken } from './admin-catalog';

interface DeliveryPackage {
  projectId: string;
  status: string; // 'complete' | 'awaiting_character_images'
  arquivos: string[];
  summary: string;
  timestamp: string;
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

  const forgeBaseUrl = env.FORGE_PUBLIC_URL ?? 'https://tr3vo-forge.al-kbhal.workers.dev';
  const temEpub = pkg.arquivos.some((a) => a.startsWith(`epub/${pkg.projectId}/`));
  const arquivoUrl = temEpub
    ? `${forgeBaseUrl}/project/${pkg.projectId}/epub`
    : `${forgeBaseUrl}/project/${pkg.projectId}/html`;

  const titulo = pkg.summary.match(/^Obra "(.+?)"/)?.[1] ?? `Forge ${pkg.projectId.slice(0, 8)}`;
  const slug = `forge-${pkg.projectId.slice(0, 8)}`;

  // Portão humano: cria como rascunho (ativo=false, preço placeholder).
  // Precificação real e ativação ficam pro admin, via /api/admin/catalogo já existente.
  const r = await sb(env, 'products', {
    method: 'POST',
    headers: { Prefer: 'return=representation' } as any,
    body: JSON.stringify({
      slug,
      tipo: 'ebook',
      titulo,
      descricao: pkg.summary,
      preco: 0,
      ativo: false,
      arquivo_url: arquivoUrl,
    }),
  });

  if (!r.ok) {
    const err = await r.text();
    console.error('[forge-webhook] supabase error:', r.status, err);
    return Response.json({ ok: false, erro: 'supabase_error' }, { status: 502 });
  }

  console.log(`[forge-webhook] produto rascunho criado: ${slug} (projeto ${pkg.projectId})`);
  return Response.json({ ok: true, slug, projectId: pkg.projectId });
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
