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
