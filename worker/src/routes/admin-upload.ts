/**
 * admin-upload.ts — Três Trevo Worker
 * Upload de imagens de capa para R2 (BIBLIOTECA_R2, prefixo capas/)
 * Serve capas publicamente em /api/public/capas/{filename}
 *
 * POST /api/admin/upload/capa  — faz upload (admin auth)
 * GET  /api/public/capas/*     — serve imagem (sem auth, cache longo)
 */

import type { Env } from '../types';
import { verificarToken } from './admin-catalog';

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg':  'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
};
const WORKER_URL = 'https://tres-trevo-api.al-kbhal.workers.dev';

// ─── Upload ──────────────────────────────────────────────────────────────────
export async function handleAdminUploadCapa(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) {
    return Response.json({ ok: false, erro: 'unauthorized' }, { status: 401 });
  }
  if (!env.BIBLIOTECA_R2) {
    return Response.json({ ok: false, erro: 'r2_nao_configurado' }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, erro: 'multipart_invalido' }, { status: 400 });
  }

  const file = form.get('capa') as File | null;
  if (!file || !file.size) {
    return Response.json({ ok: false, erro: 'arquivo_ausente' }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return Response.json({ ok: false, erro: 'arquivo_muito_grande', max_mb: 5 }, { status: 413 });
  }

  const ext = ALLOWED_TYPES[file.type];
  if (!ext) {
    return Response.json({ ok: false, erro: 'tipo_nao_permitido', tipo: file.type }, { status: 415 });
  }

  const rawSlug = (form.get('slug') as string | null) ?? 'livro';
  const slug = rawSlug.replace(/[^a-z0-9-]/g, '-').slice(0, 60);
  const rand = Math.random().toString(36).slice(2, 8);
  const filename = `${slug}-${Date.now()}-${rand}.${ext}`;
  const r2Key = `capas/${filename}`;

  await env.BIBLIOTECA_R2.put(r2Key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const url = `${WORKER_URL}/api/public/capas/${filename}`;
  return Response.json({ ok: true, url, key: r2Key });
}

// ─── Serve pública ────────────────────────────────────────────────────────────
export async function handlePublicCapa(request: Request, env: Env, filename: string): Promise<Response> {
  if (!env.BIBLIOTECA_R2) {
    return new Response('R2 não configurado', { status: 503 });
  }
  // Impede path traversal
  if (!filename || filename.includes('..') || filename.includes('/')) {
    return new Response('Inválido', { status: 400 });
  }

  const obj = await env.BIBLIOTECA_R2.get(`capas/${filename}`);
  if (!obj) return new Response('Não encontrado', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': obj.etag,
    },
  });
}
