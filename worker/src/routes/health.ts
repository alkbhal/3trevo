/**
 * health.ts — Três Trevo Worker
 * Monitoramento de saúde do sistema
 *
 * GET /health                  — público, resposta rápida (< 50ms)
 * GET /api/health/status       — público, verifica todos os componentes
 * GET /api/admin/health        — admin, inclui log de erros e métricas de segurança
 * GET /api/admin/health/log    — admin, retorna os últimos erros do KV
 */

import type { Env } from '../types';
import { verificarToken } from './admin-catalog';

// ─── KV keys ─────────────────────────────────────────────────────────────────
export const KV_HEALTH_LAST   = 'health:last-check';
export const KV_HEALTH_LOG    = 'health:error-log';
export const KV_FAIL_LOGINS   = 'security:failed-logins';
export const KV_HMAC_FAILURES = 'security:hmac-failures';

// ─── Estrutura de um erro no log ──────────────────────────────────────────────
export interface ErrorEntry {
  ts: string;
  componente: string;
  nivel: 'warn' | 'error' | 'critical';
  mensagem: string;
  detalhe?: string;
}

// ─── Registrar erro no KV log ─────────────────────────────────────────────────
export async function logError(env: Env, entry: Omit<ErrorEntry, 'ts'>): Promise<void> {
  if (!env.TT_KV) return;
  const raw = await env.TT_KV.get(KV_HEALTH_LOG);
  const log: ErrorEntry[] = raw ? JSON.parse(raw) : [];
  log.unshift({ ts: new Date().toISOString(), ...entry });
  const trimmed = log.slice(0, 100); // manter últimos 100 erros
  await env.TT_KV.put(KV_HEALTH_LOG, JSON.stringify(trimmed), { expirationTtl: 7 * 24 * 3600 });
}

// ─── Checar Supabase ──────────────────────────────────────────────────────────
async function checkSupabase(env: Env): Promise<{ ok: boolean; latencia_ms: number; detalhe?: string }> {
  const t0 = Date.now();
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/catalogo?select=slug&limit=1`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    return { ok: r.ok, latencia_ms: Date.now() - t0 };
  } catch(e) {
    return { ok: false, latencia_ms: Date.now() - t0, detalhe: String(e) };
  }
}

// ─── Checar KV ────────────────────────────────────────────────────────────────
async function checkKV(env: Env): Promise<{ ok: boolean; latencia_ms: number; detalhe?: string }> {
  if (!env.TT_KV) return { ok: false, latencia_ms: 0, detalhe: 'KV não configurado' };
  const t0 = Date.now();
  try {
    const probe = `health:probe:${Date.now()}`;
    await env.TT_KV.put(probe, '1', { expirationTtl: 60 });
    const val = await env.TT_KV.get(probe);
    await env.TT_KV.delete(probe);
    return { ok: val === '1', latencia_ms: Date.now() - t0 };
  } catch(e) {
    return { ok: false, latencia_ms: Date.now() - t0, detalhe: String(e) };
  }
}

// ─── Checar Anthropic API ─────────────────────────────────────────────────────
async function checkAnthropic(env: Env): Promise<{ ok: boolean; latencia_ms: number; detalhe?: string }> {
  const t0 = Date.now();
  try {
    const r = await fetch('https://api.anthropic.com/v1/models', {
      headers: { 'x-api-key': env.ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(5000),
    });
    return { ok: r.status !== 401 && r.status !== 403, latencia_ms: Date.now() - t0 };
  } catch(e) {
    return { ok: false, latencia_ms: Date.now() - t0, detalhe: String(e) };
  }
}

// ─── Checar Resend ────────────────────────────────────────────────────────────
async function checkResend(env: Env): Promise<{ ok: boolean; latencia_ms: number; detalhe?: string }> {
  const t0 = Date.now();
  try {
    const r = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    return { ok: r.status < 500, latencia_ms: Date.now() - t0 };
  } catch(e) {
    return { ok: false, latencia_ms: Date.now() - t0, detalhe: String(e) };
  }
}

// ─── Ler métricas de segurança ────────────────────────────────────────────────
async function securityMetrics(env: Env) {
  if (!env.TT_KV) return { failed_logins: 0, hmac_failures: 0 };
  const [fl, hf] = await Promise.all([
    env.TT_KV.get(KV_FAIL_LOGINS),
    env.TT_KV.get(KV_HMAC_FAILURES),
  ]);
  return {
    failed_logins: parseInt(fl ?? '0', 10),
    hmac_failures: parseInt(hf ?? '0', 10),
  };
}

// ─── Registrar falha de login ─────────────────────────────────────────────────
export async function registrarFalhaLogin(env: Env, ip: string): Promise<number> {
  if (!env.TT_KV) return 0;
  const raw = await env.TT_KV.get(KV_FAIL_LOGINS);
  const count = parseInt(raw ?? '0', 10) + 1;
  await env.TT_KV.put(KV_FAIL_LOGINS, String(count), { expirationTtl: 3600 });
  if (count >= 5) {
    await logError(env, {
      componente: 'security',
      nivel: 'critical',
      mensagem: `${count} tentativas de login admin falhadas em 1h`,
      detalhe: `IP: ${ip}`,
    });
  }
  return count;
}

// ─── Registrar falha HMAC ─────────────────────────────────────────────────────
export async function registrarFalhaHMAC(env: Env, ip: string): Promise<void> {
  if (!env.TT_KV) return;
  const raw = await env.TT_KV.get(KV_HMAC_FAILURES);
  const count = parseInt(raw ?? '0', 10) + 1;
  await env.TT_KV.put(KV_HMAC_FAILURES, String(count), { expirationTtl: 3600 });
  if (count >= 10) {
    await logError(env, {
      componente: 'webhook',
      nivel: 'critical',
      mensagem: `${count} falhas HMAC no webhook em 1h — possível ataque`,
      detalhe: `Último IP: ${ip}`,
    });
  }
}

// ─── Rota pública: GET /health ────────────────────────────────────────────────
export function handleHealthBasic(): Response {
  return Response.json({ ok: true, version: '2.1.0', ts: new Date().toISOString() });
}

// ─── Rota pública: GET /api/health/status ────────────────────────────────────
export async function handleHealthStatus(env: Env): Promise<Response> {
  // Tenta usar cache do KV (máx 5min de latência no status público)
  if (env.TT_KV) {
    const cached = await env.TT_KV.get(KV_HEALTH_LAST);
    if (cached) {
      const parsed = JSON.parse(cached);
      const age_s = (Date.now() - new Date(parsed.checked_at).getTime()) / 1000;
      if (age_s < 300) {
        return new Response(cached, {
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT', 'X-Age': String(Math.round(age_s)) },
        });
      }
    }
  }

  const [supabase, kv] = await Promise.all([
    checkSupabase(env),
    checkKV(env),
  ]);

  const status = {
    ok: supabase.ok && kv.ok,
    checked_at: new Date().toISOString(),
    components: { supabase, kv },
  };

  if (env.TT_KV) {
    await env.TT_KV.put(KV_HEALTH_LAST, JSON.stringify(status), { expirationTtl: 7200 });
  }

  return Response.json(status, { status: status.ok ? 200 : 503 });
}

// ─── Rota admin: GET /api/admin/health ───────────────────────────────────────
export async function handleAdminHealth(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });

  const [supabase, kv, anthropic, resend, security] = await Promise.all([
    checkSupabase(env),
    checkKV(env),
    checkAnthropic(env),
    checkResend(env),
    securityMetrics(env),
  ]);

  const componentes = { supabase, kv, anthropic, resend };
  const tudo_ok = Object.values(componentes).every(c => c.ok);
  const alertas: string[] = [];

  if (!supabase.ok) alertas.push('🔴 Supabase inacessível');
  if (!kv.ok) alertas.push('🔴 KV inacessível');
  if (!anthropic.ok) alertas.push('🟡 Anthropic API degradada');
  if (!resend.ok) alertas.push('🟡 Resend inacessível');
  if (security.failed_logins >= 5) alertas.push(`🔴 ${security.failed_logins} tentativas de login falhadas (última hora)`);
  if (security.hmac_failures >= 10) alertas.push(`🔴 ${security.hmac_failures} falhas HMAC (possível ataque)`);
  if (supabase.latencia_ms > 2000) alertas.push(`🟡 Supabase lento: ${supabase.latencia_ms}ms`);

  return Response.json({
    ok: tudo_ok,
    alertas,
    componentes,
    seguranca: security,
    checked_at: new Date().toISOString(),
  });
}

// ─── Rota admin: GET /api/admin/health/log ───────────────────────────────────
export async function handleAdminHealthLog(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });
  if (!env.TT_KV) return Response.json({ ok: false, erro: 'kv_nao_configurado' }, { status: 500 });
  const raw = await env.TT_KV.get(KV_HEALTH_LOG);
  const log: ErrorEntry[] = raw ? JSON.parse(raw) : [];
  return Response.json({ ok: true, total: log.length, log });
}
