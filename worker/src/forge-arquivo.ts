/**
 * forge-arquivo.ts — Três Trevo Worker
 * Entrega ao comprador um livro produzido pelo tr3vo-forge SEM expor o forge.
 *
 * Antes: products.arquivo_url guardava https://tr3vo-forge…/project/<id>/epub e o
 * download fazia 302 para lá. O comprador via o endereço permanente e público do
 * livro; link repassado = livro de graça. Agora o forge exige segredo nessas rotas,
 * e a loja busca o arquivo NO SERVIDOR (service binding, com o segredo) e devolve o
 * conteúdo dentro da própria resposta, atrás do token temporário que ela já emite.
 *
 * Aceita a referência nova (`forge:<projectId>/<epub|pdf|html>`) e a URL antiga do
 * forge — produtos já gravados continuam funcionando sem migração de dados.
 */

import type { Env } from './types';

const TIPOS = {
  epub: 'application/epub+zip',
  pdf: 'application/pdf',
  html: 'text/html; charset=utf-8',
} as const;
type Tipo = keyof typeof TIPOS;

export interface RefForge { projectId: string; tipo: Tipo }

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const RE_INTERNA = new RegExp(`^forge:(${UUID})/(epub|pdf|html)$`, 'i');
const RE_URL = new RegExp(`/project/(${UUID})/(epub|pdf|html)/?$`, 'i');

export function forgeBase(env: Env): string {
  return (env.FORGE_PUBLIC_URL ?? 'https://tr3vo-forge.al-kbhal.workers.dev').replace(/\/+$/, '');
}

/** Referência interna gravada em products.arquivo_url para livros do forge. */
export function refInterna(projectId: string, tipo: Tipo): string {
  return `forge:${projectId}/${tipo}`;
}

/** Reconhece a referência interna ou a URL antiga do forge; qualquer outra coisa → null. */
export function referenciaForge(arquivoUrl: string, env: Env): RefForge | null {
  const interna = RE_INTERNA.exec(arquivoUrl);
  if (interna) return { projectId: interna[1]!.toLowerCase(), tipo: interna[2]!.toLowerCase() as Tipo };
  let u: URL;
  try { u = new URL(arquivoUrl); } catch { return null; }
  let base: URL;
  try { base = new URL(forgeBase(env)); } catch { return null; }
  if (u.origin !== base.origin) return null;
  const m = RE_URL.exec(u.pathname);
  return m ? { projectId: m[1]!.toLowerCase(), tipo: m[2]!.toLowerCase() as Tipo } : null;
}

/**
 * Busca o arquivo no forge com o segredo e devolve a resposta ao comprador.
 * Falha FECHADA: sem FORGE_API_SECRET, 503 — nunca redireciona para o forge.
 */
export async function entregarArquivoForge(ref: RefForge, env: Env, nomeBase = 'ebook'): Promise<Response> {
  if (!env.FORGE_API_SECRET) {
    console.error('[forge-arquivo] FORGE_API_SECRET ausente — entrega recusada');
    return new Response('Entrega temporariamente indisponível', { status: 503 });
  }
  const caminho = `/project/${ref.projectId}/${ref.tipo}`;
  const headers = {
    // Service binding entre workers pode remover Authorization: o forge aceita os dois.
    Authorization: `Bearer ${env.FORGE_API_SECRET}`,
    'X-Forge-Secret': env.FORGE_API_SECRET,
  };
  let r: Response;
  try {
    r = env.FORGE
      ? await env.FORGE.fetch(new Request(`https://forge.interno${caminho}`, { headers }))
      : await fetch(`${forgeBase(env)}${caminho}`, { headers });
  } catch (err) {
    console.error('[forge-arquivo] forge inacessível:', err);
    return new Response('Arquivo indisponível', { status: 502 });
  }
  if (!r.ok || !r.body) {
    console.error(`[forge-arquivo] forge respondeu ${r.status} para ${caminho}`);
    return new Response('Arquivo indisponível', { status: r.status === 404 ? 404 : 502 });
  }
  const nome = `${nomeBase.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 80) || 'ebook'}.${ref.tipo}`;
  return new Response(r.body, {
    status: 200,
    headers: {
      'Content-Type': TIPOS[ref.tipo],
      'Content-Disposition': `attachment; filename="${nome}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
