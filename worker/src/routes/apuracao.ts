/**
 * apuracao.ts — Três Trevo Worker
 * Admin-only: fila de moderação e moderação manual de depoimentos
 *
 * GET  /api/admin/fila      — depoimentos aguardando revisão manual
 * POST /api/admin/moderar   — aprovar/rejeitar depoimento
 *
 * NOTA: handleApuracao (Loteria Federal) foi removido em 16/06/2026.
 * Ver worker/src/routes/sorteio.ts para o novo sistema de sorteio puro RNG.
 */

import type { Env } from '../types';
import { verificarToken } from './admin-catalog';

// ─── GET /api/admin/fila ──────────────────────────────────────────────────────
export async function handleFilaRevisao(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });

  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/fila_revisao_manual`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_limit: 100 }),
  });
  return Response.json(await resp.json());
}

// ─── POST /api/admin/moderar ──────────────────────────────────────────────────
export async function handleModerar(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }

  const { dep_id, aprovado, motivo } = body ?? {};
  if (!dep_id || aprovado === undefined) {
    return Response.json({ ok: false, erro: 'dep_id e aprovado obrigatórios' }, { status: 400 });
  }

  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/aprovar_depoimento_manual`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_dep_id: dep_id, p_aprovado: aprovado, p_motivo: motivo ?? null }),
  });
  return Response.json(await resp.json());
}
