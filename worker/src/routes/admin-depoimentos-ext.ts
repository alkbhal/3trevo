/**
 * admin-depoimentos-ext.ts — Três Trevo Worker
 * Extensão da gestão de depoimentos para o painel admin
 *
 * GET   /api/admin/depoimentos?estado=aprovado|reprovado  — lista por estado
 * PATCH /api/admin/depoimentos/:id                        — editar texto/estado
 */

import type { Env } from '../types';
import { verificarToken } from './admin-catalog';

function sb(env: Env, path: string, opts: RequestInit = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });
}

// ─── Listar por estado ────────────────────────────────────────────────────────
export async function handleAdminDepoimentosList(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });

  const url = new URL(request.url);
  const estado = url.searchParams.get('estado') ?? 'aprovado';
  const allowed = ['aprovado', 'reprovado', 'pendente', 'revisao_manual'];
  if (!allowed.includes(estado)) return Response.json({ ok: false, erro: 'estado_invalido' }, { status: 400 });

  const r = await sb(
    env,
    `depoimentos?estado=eq.${estado}&order=created_at.desc&limit=50&select=id,texto,nome,email,slug,estado,created_at`
  );
  const data = await r.json();
  return Response.json(data);
}

// ─── Editar depoimento ────────────────────────────────────────────────────────
export async function handleAdminDepoimentoUpdate(
  request: Request,
  env: Env,
  id: string
): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }

  const updates: Record<string, any> = {};
  if (body.texto !== undefined) updates.texto = String(body.texto).trim();
  if (body.nome !== undefined) updates.nome = String(body.nome).trim();
  if (body.estado !== undefined) {
    const allowed = ['aprovado', 'reprovado', 'pendente', 'revisao_manual'];
    if (!allowed.includes(body.estado)) return Response.json({ ok: false, erro: 'estado_invalido' }, { status: 400 });
    updates.estado = body.estado;
    if (body.estado === 'aprovado') updates.aprovado_em = new Date().toISOString();
  }

  if (!Object.keys(updates).length) return Response.json({ ok: false, erro: 'nenhum_campo' }, { status: 400 });

  const r = await sb(env, `depoimentos?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });

  if (!r.ok) return Response.json({ ok: false, erro: 'supabase_error' }, { status: 400 });
  return Response.json({ ok: true });
}
