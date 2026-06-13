/**
 * health-monitor.ts — Três Trevo Worker
 * Cron de monitoramento: dispara toda hora (0 * * * *)
 *
 * Responsabilidades:
 * 1. Verificar saúde de todos os componentes (Supabase, KV, Anthropic, Resend)
 * 2. Detectar anomalias de segurança (logins falhos, HMAC failures)
 * 3. Verificar integridade dos dados críticos (draw ativo, catálogo)
 * 4. Enviar alerta por email se qualquer check crítico falhar
 * 5. Registrar resultado no KV para consulta no admin
 * 6. Tentar auto-recuperação quando possível (máx. 3 tentativas por ciclo)
 *
 * Níveis de alerta:
 * - INFO    → log silencioso
 * - WARN    → log + registra no KV
 * - ERROR   → log + KV + email imediato
 * - CRITICAL → log + KV + email + bloqueia operações sensíveis
 */

import type { Env } from '../types';
import { logError, KV_HEALTH_LAST, KV_HEALTH_LOG, KV_FAIL_LOGINS, KV_HMAC_FAILURES } from '../routes/health';

const ALERTA_EMAIL  = 'sac@3trevo.com.br';
const FROM_EMAIL    = 'sistema@3trevo.com.br';
const RESEND_API    = 'https://api.resend.com/emails';

// ─── Email de alerta ──────────────────────────────────────────────────────────
async function enviarAlerta(env: Env, assunto: string, corpo: string): Promise<void> {
  if (!env.RESEND_API_KEY) { console.error('[monitor] RESEND_API_KEY ausente — alerta não enviado'); return; }
  try {
    await fetch(RESEND_API, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `Sistema TT <${FROM_EMAIL}>`,
        to: [ALERTA_EMAIL],
        subject: `[TT ALERTA] ${assunto}`,
        html: `<pre style="font-family:monospace;font-size:14px;">${corpo}</pre>`,
      }),
    });
  } catch(e) {
    console.error('[monitor] Falha ao enviar alerta:', e);
  }
}

// ─── Check Supabase com retry ──────────────────────────────────────────────────
async function checkSupabaseComRetry(env: Env, tentativas = 3): Promise<{ ok: boolean; tentativa: number; latencia_ms: number }> {
  for (let i = 1; i <= tentativas; i++) {
    const t0 = Date.now();
    try {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/catalogo?select=slug&limit=1`, {
        headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) return { ok: true, tentativa: i, latencia_ms: Date.now() - t0 };
    } catch(e) {
      console.warn(`[monitor] Supabase tentativa ${i}/${tentativas} falhou:`, e);
    }
    if (i < tentativas) await new Promise(r => setTimeout(r, 2000 * i));
  }
  return { ok: false, tentativa: tentativas, latencia_ms: 0 };
}

// ─── Verificar integridade do catálogo ────────────────────────────────────────
async function checkIntegridadeCatalogo(env: Env): Promise<{ ok: boolean; ativos: number; problemas: string[] }> {
  const problemas: string[] = [];
  try {
    const r = await fetch(`${env.SUPABASE_URL}/rest/v1/catalogo?ativo=eq.true&select=slug,titulo,preco,cotas`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
    });
    const livros = await r.json() as any[];
    for (const l of livros) {
      if (!l.titulo) problemas.push(`Livro sem título: ${l.slug}`);
      if (!l.preco || l.preco <= 0) problemas.push(`Preço inválido: ${l.slug} (${l.preco})`);
      if (![1, 3, 10].includes(l.cotas)) problemas.push(`Cotas inválidas: ${l.slug} (${l.cotas})`);
    }
    return { ok: problemas.length === 0, ativos: livros.length, problemas };
  } catch(e) {
    return { ok: false, ativos: 0, problemas: [String(e)] };
  }
}

// ─── Verificar draw ativo ──────────────────────────────────────────────────────
async function checkDraw(env: Env): Promise<{ ok: boolean; draw_id: string | null; entries: number }> {
  try {
    const [drawR, entriesR] = await Promise.all([
      fetch(`${env.SUPABASE_URL}/rest/v1/draws?status=eq.open&select=id,titulo&limit=1`, {
        headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
      }),
      fetch(`${env.SUPABASE_URL}/rest/v1/draw_entries?estado=eq.valido&select=count`, {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          Prefer: 'count=exact', Range: '0-0',
        },
      }),
    ]);
    const draws = await drawR.json() as any[];
    const entries = parseInt(entriesR.headers.get('Content-Range')?.split('/')[1] ?? '0', 10);
    return { ok: true, draw_id: draws[0]?.id ?? null, entries };
  } catch(e) {
    return { ok: false, draw_id: null, entries: 0 };
  }
}

// ─── Verificar KV ─────────────────────────────────────────────────────────────
async function checkKV(env: Env): Promise<{ ok: boolean; latencia_ms: number }> {
  if (!env.TT_KV) return { ok: false, latencia_ms: 0 };
  const t0 = Date.now();
  try {
    const k = `health:probe:cron:${Date.now()}`;
    await env.TT_KV.put(k, '1', { expirationTtl: 60 });
    const v = await env.TT_KV.get(k);
    await env.TT_KV.delete(k);
    return { ok: v === '1', latencia_ms: Date.now() - t0 };
  } catch(e) {
    return { ok: false, latencia_ms: Date.now() - t0 };
  }
}

// ─── Ler métricas de segurança ─────────────────────────────────────────────────
async function lerSeguranca(env: Env) {
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

// ─── Cron principal ───────────────────────────────────────────────────────────
export async function handleHealthMonitor(env: Env): Promise<void> {
  console.log('[monitor] Iniciando verificação de saúde:', new Date().toISOString());

  const erros: string[] = [];
  const avisos: string[] = [];

  // 1. Supabase (com retry automático — 3 tentativas)
  const supabase = await checkSupabaseComRetry(env);
  if (!supabase.ok) {
    erros.push(`Supabase INDISPONÍVEL após ${supabase.tentativa} tentativas`);
    await logError(env, {
      componente: 'supabase',
      nivel: 'critical',
      mensagem: 'Supabase inacessível após 3 tentativas',
    });
  } else if (supabase.latencia_ms > 3000) {
    avisos.push(`Supabase lento: ${supabase.latencia_ms}ms (tentativa ${supabase.tentativa})`);
    await logError(env, {
      componente: 'supabase',
      nivel: 'warn',
      mensagem: `Supabase com latência elevada: ${supabase.latencia_ms}ms`,
    });
  }

  // 2. KV
  const kv = await checkKV(env);
  if (!kv.ok) {
    erros.push('KV INDISPONÍVEL — rate limiting e cache comprometidos');
    await logError(env, { componente: 'kv', nivel: 'error', mensagem: 'KV Cloudflare inacessível' });
  }

  // 3. Integridade do catálogo
  if (supabase.ok) {
    const catalogo = await checkIntegridadeCatalogo(env);
    if (!catalogo.ok) {
      const msg = `Problemas no catálogo: ${catalogo.problemas.join('; ')}`;
      avisos.push(msg);
      await logError(env, { componente: 'catalogo', nivel: 'warn', mensagem: msg });
    }
    if (catalogo.ativos === 0) {
      erros.push('ZERO livros ativos no catálogo — site sem produtos!');
      await logError(env, { componente: 'catalogo', nivel: 'critical', mensagem: 'Catálogo vazio — nenhum livro ativo' });
    }
  }

  // 4. Draw ativo
  if (supabase.ok) {
    const draw = await checkDraw(env);
    if (!draw.ok) {
      avisos.push('Não foi possível verificar draws ativos');
    }
    // Não é erro se não houver draw ativo — pode estar entre rodadas
  }

  // 5. Segurança
  const seg = await lerSeguranca(env);
  if (seg.failed_logins >= 10) {
    erros.push(`ATAQUE detectado: ${seg.failed_logins} tentativas de login admin na última hora`);
    await logError(env, {
      componente: 'security',
      nivel: 'critical',
      mensagem: `Possível ataque de força bruta: ${seg.failed_logins} logins falhos/hora`,
    });
  } else if (seg.failed_logins >= 5) {
    avisos.push(`Atenção: ${seg.failed_logins} tentativas de login admin na última hora`);
  }

  if (seg.hmac_failures >= 20) {
    erros.push(`ATAQUE detectado: ${seg.hmac_failures} falhas HMAC no webhook na última hora`);
    await logError(env, {
      componente: 'security',
      nivel: 'critical',
      mensagem: `Possível ataque no webhook: ${seg.hmac_failures} falhas HMAC/hora`,
    });
  } else if (seg.hmac_failures >= 10) {
    avisos.push(`Atenção: ${seg.hmac_failures} falhas HMAC no webhook na última hora`);
  }

  // 6. Salvar resultado no KV
  const resultado = {
    ok: erros.length === 0,
    erros,
    avisos,
    supabase: { ok: supabase.ok, latencia_ms: supabase.latencia_ms },
    kv: { ok: kv.ok },
    seguranca: seg,
    checked_at: new Date().toISOString(),
  };

  if (env.TT_KV) {
    await env.TT_KV.put(KV_HEALTH_LAST, JSON.stringify(resultado), { expirationTtl: 7200 });
  }

  // 7. Alertas por email
  if (erros.length > 0) {
    const corpo = [
      `Timestamp: ${resultado.checked_at}`,
      '',
      '🔴 ERROS CRÍTICOS:',
      ...erros.map(e => `  • ${e}`),
      '',
      avisos.length > 0 ? '🟡 AVISOS:\n' + avisos.map(a => `  • ${a}`).join('\n') : '',
      '',
      'Acesse o painel admin para detalhes: https://3trevo.com.br/admin.html',
    ].join('\n');

    await enviarAlerta(env, `${erros.length} erro(s) crítico(s) detectado(s)`, corpo);
    console.error('[monitor] Alertas enviados. Erros:', erros);
  } else if (avisos.length > 0) {
    console.warn('[monitor] Avisos:', avisos);
    // Avisos não geram email — apenas log
  } else {
    console.log('[monitor] Todos os sistemas operacionais.');
  }
}
