/**
 * admin-hero.ts — Três Trevo Worker
 * Configuração do hero armazenada em Cloudflare KV
 * (nunca em HTML público ou GitHub — regra do projeto)
 *
 * GET /api/admin/hero-config   — lê configuração atual do KV
 * PUT /api/admin/hero-config   — grava nova configuração no KV
 *
 * Estrutura do KV (chave: "site:hero-config"):
 * {
 *   video_url: string,
 *   poster_url: string,
 *   titulo_pt: string,  // suporta <em> para itálico
 *   sub_pt: string,
 *   carousel_slugs: string[],  // ordem dos livros no showcase
 *   updated_at: string,        // ISO timestamp
 * }
 */

import type { Env } from '../types';
import { verificarToken } from './admin-catalog';

const KV_KEY = 'site:hero-config';

// ─── GET ──────────────────────────────────────────────────────────────────────
export async function handleHeroConfigGet(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });

  if (!env.TT_KV) return Response.json({ ok: false, erro: 'kv_nao_configurado' }, { status: 500 });

  const raw = await env.TT_KV.get(KV_KEY);
  if (!raw) {
    // Retorna config padrão — admin verá os campos vazios para preencher
    return Response.json({
      video_url: 'assets/hero-reel.mp4',
      poster_url: 'assets/hero-poster.jpg',
      titulo_pt: 'Palavras que <em>transformam</em> o mundo real',
      sub_pt: 'Publicamos ebooks que mudam perspectivas — de ficção geopolítica a manuais de sobrevivência empresarial.',
      carousel_slugs: [],
      updated_at: null,
    });
  }

  return new Response(raw, { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

// ─── PUT ──────────────────────────────────────────────────────────────────────
export async function handleHeroConfigPut(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });
  if (!env.TT_KV) return Response.json({ ok: false, erro: 'kv_nao_configurado' }, { status: 500 });

  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }

  // Só salva campos conhecidos — nunca persiste campos arbitrários
  const config = {
    video_url:       String(body.video_url ?? 'assets/hero-reel.mp4'),
    poster_url:      String(body.poster_url ?? ''),
    titulo_pt:       String(body.titulo_pt ?? ''),
    titulo_en:       String(body.titulo_en ?? ''),
    titulo_es:       String(body.titulo_es ?? ''),
    sub_pt:          String(body.sub_pt ?? ''),
    sub_en:          String(body.sub_en ?? ''),
    sub_es:          String(body.sub_es ?? ''),
    destaque_slug:   String(body.destaque_slug ?? ''),
    destaque_titulo: String(body.destaque_titulo ?? ''),
    destaque_badge:  String(body.destaque_badge ?? 'Destaque'),
    carousel_slugs:  Array.isArray(body.carousel_slugs) ? body.carousel_slugs : [],
    updated_at:      new Date().toISOString(),
  };

  await env.TT_KV.put(KV_KEY, JSON.stringify(config));
  return Response.json({ ok: true, updated_at: config.updated_at });
}
