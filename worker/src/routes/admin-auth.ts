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

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function derivarPinHash(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 200_000 },
    key, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function upgradeParaPbkdf2(env: Env, userId: string, pin: string): Promise<void> {
  const salt = crypto.randomUUID();
  const hash = await derivarPinHash(pin, salt);
  await sb(env, `dash_usuarios?id=eq.${userId}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ pin_salt: salt, pin_hash_v2: hash }),
  });
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

  const userResp = await sb(env, `dash_usuarios?select=id,pin_hash,pin_hash_v2,pin_salt`);
  if (!userResp.ok) {
    const errBody = await userResp.text().catch(() => '');
    console.error('Supabase query falhou:', userResp.status, errBody);
    return json({ ok: false, erro: 'internal_error' }, 500);
  }
  const users = (await userResp.json()) as any[];

  let usuarioId: string | null = null;
  for (const usuario of users) {
    let pinValido = false;
    if (usuario.pin_hash_v2 && usuario.pin_salt) {
      const hash = await derivarPinHash(pin, usuario.pin_salt);
      pinValido = hash === usuario.pin_hash_v2;
    } else {
      // ponytail: fallback SHA-256 legado — auto-upgrade na próxima linha
      const hash = await sha256(pin);
      pinValido = hash === usuario.pin_hash;
      if (pinValido) {
        upgradeParaPbkdf2(env, usuario.id, pin).catch(e => console.error('[auth] upgrade PBKDF2 falhou:', e));
      }
    }
    if (pinValido) { usuarioId = usuario.id; break; }
  }

  if (!usuarioId) {
    await registrarFalhaLogin(env, ip);
    return json({ ok: false, erro: 'pin_invalido' }, 401);
  }

  const rawToken = crypto.randomUUID();
  const tokenHash = await sha256(rawToken);
  const sessaoResp = await sb(env, 'admin_sessoes', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ ip: request.headers.get('CF-Connecting-IP'), token_hash: tokenHash }),
  });
  const [sessao] = (await sessaoResp.json()) as any[];

  return json({ ok: true, token: rawToken, expira_em: sessao.expira_em });
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
