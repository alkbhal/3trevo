/**
 * forge-download.ts — Três Trevo Worker
 * Os arquivos do tr3vo-forge (/project/{id}/epub|pdf|html) não são públicos:
 * só abrem com URL assinada (?exp=&sig=). O site assina DEPOIS de validar a
 * compra/sessão, com o mesmo FORGE_DOWNLOAD_SECRET configurado no forge.
 *
 * Formato (tem que bater com tr3vo-forge lib/security/download-url.ts):
 *   sig = hex(HMAC-SHA256(secret, `${projectId}.${formato}.${exp}`)), exp em segundos Unix.
 */

import type { Env } from './types';

export type FormatoForge = 'epub' | 'pdf' | 'html';

const FORGE_URL_PADRAO = 'https://tr3vo-forge.al-kbhal.workers.dev';
// Link vale pouco: ele é gerado no clique (redirect) ou logo antes de abrir.
export const FORGE_LINK_TTL_S = 15 * 60;

export function forgeBaseUrl(env: Env): string {
  return (env.FORGE_PUBLIC_URL ?? FORGE_URL_PADRAO).replace(/\/+$/, '');
}

/** Reconhece uma URL de arquivo do forge (gravada em products/biblioteca). */
export function arquivoForge(url: string, env: Env): { projectId: string; formato: FormatoForge } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.origin !== new URL(forgeBaseUrl(env)).origin) return null;
  const m = u.pathname.match(/^\/project\/([0-9a-f-]{36})\/(epub|pdf|html)$/i);
  if (!m) return null;
  return { projectId: m[1].toLowerCase(), formato: m[2].toLowerCase() as FormatoForge };
}

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function assinarForge(
  env: Env, projectId: string, formato: FormatoForge, ttlS = FORGE_LINK_TTL_S, nowS = Math.floor(Date.now() / 1000)
): Promise<string | null> {
  if (!env.FORGE_DOWNLOAD_SECRET) return null;
  const exp = nowS + ttlS;
  const sig = await hmacHex(env.FORGE_DOWNLOAD_SECRET, `${projectId}.${formato}.${exp}`);
  return `${forgeBaseUrl(env)}/project/${projectId}/${formato}?exp=${exp}&sig=${sig}`;
}

/**
 * URL externa guardada no banco → URL que o navegador pode abrir.
 * Forge: devolve assinada (ou null se FORGE_DOWNLOAD_SECRET faltar). Outras: igual.
 */
export async function resolverUrlExterna(url: string, env: Env): Promise<string | null> {
  const f = arquivoForge(url, env);
  if (!f) return url;
  const assinada = await assinarForge(env, f.projectId, f.formato);
  if (!assinada) console.error('[forge-download] FORGE_DOWNLOAD_SECRET ausente — link do forge não pode ser assinado');
  return assinada;
}

// ─── Cópia para o armazenamento do site ──────────────────────────────────────
// O livro vendido não fica apontando pro forge: no webhook (e na publicação pelo
// admin) o EPUB/PDF é copiado pro bucket "ebooks" do Supabase Storage, na mesma
// convenção dos títulos já existentes ({slug}.pdf / {slug}.epub). Assim
// /api/download e get-download servem como qualquer outro produto, e quem comprou
// não é afetado se o projeto for reprocessado ou apagado no forge.

const MAX_ARQUIVO_BYTES = 100 * 1024 * 1024;
const CONTENT_TYPE: Record<'epub' | 'pdf', string> = { epub: 'application/epub+zip', pdf: 'application/pdf' };

async function baixarDoForge(env: Env, projectId: string, formato: 'epub' | 'pdf', lang?: string): Promise<ArrayBuffer | null> {
  const url = await assinarForge(env, projectId, formato);
  if (!url) return null;
  // lang fica fora da assinatura no forge: escolhe entre edições do mesmo livro.
  const r = await fetch(lang ? `${url}&lang=${encodeURIComponent(lang)}` : url);
  if (!r.ok) {
    if (r.status !== 404) console.error(`[forge-download] ${formato} de ${projectId}: forge respondeu ${r.status}`);
    return null;
  }
  const bytes = await r.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_ARQUIVO_BYTES) {
    console.error(`[forge-download] ${formato} de ${projectId} com tamanho inválido: ${bytes.byteLength}`);
    return null;
  }
  return bytes;
}

/** Copia EPUB/PDF do forge pro bucket "ebooks". Devolve os caminhos gravados (o que falhar fica de fora). */
export async function copiarParaStorage(
  env: Env, projectId: string, slug: string, formatos: Array<'epub' | 'pdf'> = ['epub', 'pdf'], lang?: string
): Promise<{ epub?: string; pdf?: string }> {
  const out: { epub?: string; pdf?: string } = {};
  for (const formato of formatos) {
    const bytes = await baixarDoForge(env, projectId, formato, lang);
    if (!bytes) continue;
    const caminho = `${slug}.${formato}`;
    const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/ebooks/${encodeURIComponent(caminho)}`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': CONTENT_TYPE[formato],
        'x-upsert': 'true', // republicar o mesmo slug substitui o arquivo
      },
      body: bytes,
    });
    if (!r.ok) {
      console.error(`[forge-download] upload ${caminho} falhou:`, r.status, await r.text().catch(() => ''));
      continue;
    }
    out[formato] = caminho;
  }
  return out;
}

/** Biblioteca TT lê EPUB do R2 privado (epubs/{slug}.epub, mesma chave do upload manual). */
export async function copiarEpubParaBiblioteca(env: Env, projectId: string, slug: string, lang?: string): Promise<string | null> {
  if (!env.BIBLIOTECA_R2) return null;
  const bytes = await baixarDoForge(env, projectId, 'epub', lang);
  if (!bytes) return null;
  const chave = `epubs/${slug}.epub`;
  await env.BIBLIOTECA_R2.put(chave, bytes, { httpMetadata: { contentType: CONTENT_TYPE.epub } });
  return chave;
}
