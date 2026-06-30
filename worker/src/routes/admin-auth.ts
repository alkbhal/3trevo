/**
 * admin-auth.ts — Login admin + stats do dashboard
 * POST /api/admin/login  — gera sessão com PIN
 * GET  /api/admin/stats  — contadores do dashboard
 */

import type { Env } from '../types';
import { verificarToken } from './admin-catalog';
import { sb } from '../sb';
import { registrarFalhaLogin } from './health';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, erro: 'bad_request' }, 400); }

  const { pin } = body ?? {};
  if (!pin) return json({ ok: false }, 400);

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  const rlKey = `rl:login:${ip}`;
  if (env.TT_KV) {
    const attempts = parseInt((await env.TT_KV.get(rlKey)) ?? '0', 10);
    if (attempts >= 20) {
      await registrarFalhaLogin(env, ip);
      return json({ ok: false, erro: 'muitas_tentativas' }, 429);
    }
    await env.TT_KV.put(rlKey, String(attempts + 1), { expirationTtl: 3600 });
  }

  const pinHash = await sha256(pin);

  const userResp = await sb(env, `dash_usuarios?pin_hash=eq.${pinHash}&select=id`);
  const users = (await userResp.json()) as any[];
  if (!users.length) {
    await registrarFalhaLogin(env, ip);
    return json({ ok: false, erro: 'pin_invalido' }, 401);
  }

  const sessaoResp = await sb(env, 'admin_sessoes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ip: request.headers.get('CF-Connecting-IP') }),
  });
  const [sessao] = (await sessaoResp.json()) as any[];

  return json({ ok: true, token: sessao.token, expira_em: sessao.expira_em });
}

export async function handleAdminStats(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const [pedidosR, entriesR, depR, drawsR, filaR] = await Promise.all([
    sb(env, 'pedidos?select=count', { headers: { Prefer: 'count=exact', Range: '0-0' } }),
    sb(env, 'draw_entries?select=count', { headers: { Prefer: 'count=exact', Range: '0-0' } }),
    sb(env, 'depoimentos?estado=eq.aprovado&select=count', { headers: { Prefer: 'count=exact', Range: '0-0' } }),
    sb(env, 'draws?status=eq.open&select=id,titulo,status'),
    sb(env, 'depoimentos?estado=eq.revisao_manual&select=count', { headers: { Prefer: 'count=exact', Range: '0-0' } }),
  ]);

  const parseCount = (r: Response) => parseInt(r.headers.get('Content-Range')?.split('/')[1] ?? '0', 10);
  const draws = (await drawsR.json()) as any[];

  return Response.json({
    ok: true,
    total_pedidos: parseCount(pedidosR),
    total_entries: parseCount(entriesR),
    depoimentos_aprovados: parseCount(depR),
    revisao_pendente: parseCount(filaR),
    draw_ativo: draws[0] ?? null,
    ts: new Date().toISOString(),
  });
}
