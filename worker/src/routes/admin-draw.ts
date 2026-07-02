/**
 * admin-draw.ts — Progresso do sorteio ativo
 * GET /api/admin/draw/progress
 */

import type { Env } from '../types';
import { verificarToken } from './admin-catalog';
import { sb } from '../sb';

export async function handleDrawProgress(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });

  const r = await sb(env, 'draw_progress?status=eq.open&limit=1');
  if (!r.ok) return Response.json({ ok: true, draw: null });
  const rows = (await r.json().catch(() => [])) as any[];
  const d = rows[0];
  if (!d) return Response.json({ ok: true, draw: null });

  const diasRestantes = d.data_limite
    ? Math.max(0, Math.ceil((new Date(d.data_limite).getTime() - Date.now()) / 86400000))
    : null;
  const previsao_dias =
    d.cotas_restantes > 0 && d.cotas_vendidas > 0
      ? Math.ceil(d.cotas_restantes / (d.cotas_vendidas / Math.max(1, diasRestantes ?? 30)))
      : null;

  return Response.json({ ok: true, draw: { ...d, diasRestantes, previsao_dias } });
}
