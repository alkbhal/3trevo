/**
 * sorteio.ts — Três Trevo Worker
 * Admin-only: sorteio por commit-reveal navegador↔servidor ("Semente TT",
 * mesmo motor canônico do DOTIS — packages/core/src/routes/sorteio.ts).
 *
 * POST /api/admin/sorteio/iniciar  — fase 1: navegador comita client_hash às
 *   cegas do server_seed; servidor comita server_hash às cegas do client_seed.
 * POST /api/admin/sorteio/revelar  — fase 2: navegador revela client_seed;
 *   servidor confere o hash, combina os 2 seeds e só então sorteia.
 *
 * Substitui 3 motores incompatíveis que coexistiam sem se verificar entre si:
 * execute-draw (hash de bloco Bitcoin, sem compromisso prévio de altura —
 * brecha de grinding), o RNG só-servidor que este arquivo tinha antes (sem
 * nenhuma entrada verificável externamente), e a reimplementação mulberry32
 * da página pública de auditoria (que não reproduzia nenhum dos dois).
 *
 * Auditoria: draw_audits.details guarda client_seed/client_hash/server_seed/
 * server_hash — qualquer pessoa pode reconferir sha256(client_seed)==client_hash
 * e sha256(server_seed)==server_hash (prova que nenhum lado escolheu o seed
 * depois de ver o do outro), combinar seedFinal e recalcular o índice.
 * Regularização futura: apresentar draw_audits ao SPA/Ministério da Fazenda.
 */

import type { Env } from '../types';
import { verificarToken } from './admin-catalog';

async function sha256hex(data: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getEmailUsuario(env: Env, userId: string): Promise<string | null> {
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
    });
    if (!resp.ok) return null;
    const user = (await resp.json()) as any;
    return user.email ?? null;
  } catch {
    return null;
  }
}

function mascararEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}

async function enviarEmailVencedor(env: Env, opts: {
  email: string;
  nome: string;
  draw_titulo: string;
  numero_sorteado: number;
  hash_sha256: string;
}): Promise<void> {
  if (!env.RESEND_API_KEY) return;

  const numFormatado = opts.numero_sorteado.toString().padStart(5, '0');
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f6;">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:4px;">
      <tr><td style="background:#0f2d1a;padding:32px 40px;">
        <p style="margin:0;color:#a8c5a0;font-size:11px;letter-spacing:3px;text-transform:uppercase;">Editora Três Trevo</p>
        <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:400;">Você ganhou. ✦</h1>
      </td></tr>

      <tr><td style="padding:40px;">
        <p style="color:#2d2d2d;font-size:16px;line-height:1.7;margin:0 0 24px;">
          Olá, <strong>${opts.nome}</strong> —
        </p>
        <p style="color:#2d2d2d;font-size:16px;line-height:1.7;margin:0 0 24px;">
          Seu número foi sorteado no <strong>${opts.draw_titulo}</strong>.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f9f5;border-radius:4px;margin:0 0 32px;">
          <tr><td style="padding:24px;">
            <p style="margin:0 0 8px;color:#1e5c3a;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Sorteio Três Trevo</p>
            <p style="margin:0 0 4px;color:#2d2d2d;font-size:28px;font-weight:bold;">#${numFormatado}</p>
          </td></tr>
        </table>

        <p style="color:#4a4a4a;font-size:15px;line-height:1.7;margin:0 0 16px;">
          Entre em contato para receber seu prêmio via PIX em até 7 dias úteis.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0 0 32px;">
          <a href="mailto:sac@3trevo.com.br?subject=Prêmio%20${encodeURIComponent(opts.draw_titulo)}"
             style="display:inline-block;background:#1e5c3a;color:#fff;text-decoration:none;padding:16px 32px;border-radius:3px;font-size:15px;">
            Confirmar recebimento →
          </a>
        </td></tr></table>

        <hr style="border:none;border-top:1px solid #e8e8e4;margin:0 0 24px;">
        <p style="color:#888;font-size:12px;line-height:1.6;margin:0;">
          Hash de auditoria (SHA-256): <code style="font-size:10px;">${opts.hash_sha256}</code><br>
          <a href="https://3trevo.com.br/auditoria-sorteio.html" style="color:#1e5c3a;">Verificar auditoria pública →</a>
        </p>
      </td></tr>

      <tr><td style="background:#f0f0ec;padding:24px 40px;">
        <p style="color:#888;font-size:12px;line-height:1.6;margin:0;">
          Editora Três Trevo · CNPJ 18.928.966/0001-59 · Montauri/RS<br>
          <a href="mailto:sac@3trevo.com.br" style="color:#1e5c3a;">sac@3trevo.com.br</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Editora Três Trevo <sac@3trevo.com.br>',
      to: opts.email,
      subject: `Você ganhou no Sorteio Três Trevo — ${opts.draw_titulo}`,
      html,
    }),
  });
}

// ─── Índice vencedor a partir do seed combinado — função pura, testada em
// worker/tests/sorteio-index.test.ts. Mesma fórmula do motor do DOTIS.
export async function calcularIndiceVencedor(seedFinal: string, tamanhoCartela: number): Promise<number> {
  if (tamanhoCartela <= 0) throw new Error('tamanhoCartela deve ser > 0');
  const idxBuf = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${seedFinal}:${tamanhoCartela}`))
  );
  const idxBig = idxBuf.slice(0, 8).reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
  return Number(idxBig % BigInt(tamanhoCartela));
}

// ─── POST /api/admin/sorteio/iniciar — fase 1 (commit) ────────────────────────
export async function handleIniciarSorteio(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: any;
  try { body = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }

  const { draw_id, client_hash } = body ?? {};
  if (!draw_id || !client_hash) {
    return Response.json({ ok: false, erro: 'draw_id_e_client_hash_obrigatorios' }, { status: 400 });
  }

  const drawResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/draws?id=eq.${draw_id}&status=eq.open&select=id`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const [draw] = (await drawResp.json()) as any[];
  if (!draw) {
    return Response.json({ ok: false, erro: 'draw_nao_encontrado_ou_fechado' }, { status: 400 });
  }

  const seedBuf = new Uint8Array(16);
  crypto.getRandomValues(seedBuf);
  const server_seed = Array.from(seedBuf).map(b => b.toString(16).padStart(2, '0')).join('');
  const server_hash = await sha256hex(server_seed);

  // permite reiniciar um compromisso não revelado (ex.: admin cancelou antes de
  // revelar) — apaga o pendente anterior antes de inserir o novo; nunca apaga
  // um já revelado (histórico de auditoria). Mesmo padrão do DOTIS.
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/draw_commits?draw_id=eq.${draw_id}&revelado_em=is.null`,
    { method: 'DELETE', headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );

  const insertResp = await fetch(`${env.SUPABASE_URL}/rest/v1/draw_commits`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ draw_id, client_hash, server_seed, server_hash }),
  });

  if (!insertResp.ok) {
    return Response.json({ ok: false, erro: 'falha_ao_comprometer', detalhe: await insertResp.text() }, { status: 500 });
  }

  return Response.json({ ok: true, server_hash });
}

// ─── POST /api/admin/sorteio/revelar — fase 2 (reveal) ────────────────────────
export async function handleRevelarSorteio(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: any;
  try { body = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }

  const { draw_id, client_seed, testemunha_1, testemunha_2, certificado_numero } = body ?? {};
  if (!draw_id || !client_seed) {
    return Response.json({ ok: false, erro: 'draw_id_e_client_seed_obrigatorios' }, { status: 400 });
  }

  const commitResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/draw_commits?draw_id=eq.${draw_id}&revelado_em=is.null&select=id,client_hash,server_seed,server_hash&order=criado_em.desc&limit=1`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const [commit] = (await commitResp.json()) as Array<{ id: string; client_hash: string; server_seed: string; server_hash: string }>;
  if (!commit) {
    return Response.json({ ok: false, erro: 'compromisso_nao_encontrado_inicie_o_sorteio_primeiro' }, { status: 404 });
  }

  if ((await sha256hex(client_seed)) !== commit.client_hash) {
    return Response.json({ ok: false, erro: 'client_seed_nao_bate_com_compromisso' }, { status: 400 });
  }

  const drawResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/draws?id=eq.${draw_id}&status=eq.open&select=id,titulo,premio_1`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const [draw] = (await drawResp.json()) as any[];
  if (!draw) {
    return Response.json({ ok: false, erro: 'draw_nao_encontrado_ou_ja_fechado' }, { status: 409 });
  }

  const numResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/draw_numbers?draw_id=eq.${draw_id}&select=numero,user_id,origem`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const cartela = (await numResp.json()) as Array<{ numero: number; user_id: string; origem: string }>;
  if (!cartela.length) {
    return Response.json({ ok: false, erro: 'nenhum_numero_emitido' }, { status: 400 });
  }

  const seedFinal = await sha256hex(`${commit.server_seed}:${client_seed}`);
  const idx = await calcularIndiceVencedor(seedFinal, cartela.length);
  const sorteado = cartela[idx];

  const executado_em = new Date().toISOString();
  const emailVencedor = await getEmailUsuario(env, sorteado.user_id);

  const userCount = new Map<string, number>();
  for (const n of cartela) userCount.set(n.user_id, (userCount.get(n.user_id) ?? 0) + 1);
  const participantes = Array.from(userCount.entries()).map(([uid, total]) => ({ user_id: uid, total_numeros: total }));

  const resultado = [{
    posicao: 1,
    user_id: sorteado.user_id,
    numero_sorteado: sorteado.numero,
    email_masked: emailVencedor ? mascararEmail(emailVencedor) : null,
    testemunha_1: testemunha_1 ?? null,
    testemunha_2: testemunha_2 ?? null,
    certificado_numero: certificado_numero ?? null,
  }];

  const hash_sha256 = await sha256hex(`${draw_id}:${seedFinal}:${sorteado.numero}:${sorteado.user_id}:${executado_em}`);

  const details = {
    algoritmo: 'commit-reveal-sha256',
    client_seed,
    client_hash: commit.client_hash,
    server_seed: commit.server_seed,
    server_hash: commit.server_hash,
    seed: seedFinal,
    numero_sorteado: sorteado.numero,
    winner_user_id: sorteado.user_id,
    cartela: cartela.map(n => ({ numero: n.numero, user_id: n.user_id, origem: n.origem })),
    participantes,
    resultado,
    hash_sha256,
    executado_em,
    premio: draw.premio_1 ?? null,
  };

  const rpcResp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/registrar_resultado_sorteio_v2`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_draw_id: draw_id,
      p_seed: seedFinal,
      p_details: details,
      p_executed_by: 'admin',
      p_testemunha_1: testemunha_1 ?? null,
      p_testemunha_2: testemunha_2 ?? null,
      p_certificado_numero: certificado_numero ?? null,
    }),
  });

  if (!rpcResp.ok) {
    const err = await rpcResp.text();
    console.error('[sorteio] rpc falhou:', err);
    const jaFechado = err.includes('draw_nao_encontrado_ou_ja_fechado');
    return Response.json(
      { ok: false, erro: jaFechado ? 'draw_ja_fechado' : 'falha_registro_sorteio', detalhe: err },
      { status: jaFechado ? 409 : 500 }
    );
  }

  await fetch(`${env.SUPABASE_URL}/rest/v1/draw_commits?id=eq.${commit.id}`, {
    method: 'PATCH',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ revelado_em: executado_em }),
  });

  if (emailVencedor && env.RESEND_API_KEY) {
    try {
      await enviarEmailVencedor(env, {
        email: emailVencedor,
        nome: emailVencedor.split('@')[0],
        draw_titulo: draw.titulo,
        numero_sorteado: sorteado.numero,
        hash_sha256,
      });
    } catch (err) {
      console.error('[sorteio] email vencedor falhou:', err);
    }
  }

  if (env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'sistema@3trevo.com.br',
        to: 'rogerio.kbhal@gmail.com',
        subject: `[Três Trevo] ✦ Sorteio concluído — ${draw.titulo}`,
        html: `<p>Sorteio concluído com sucesso (commit-reveal).</p>
<ul>
  <li>Draw: <strong>${draw.titulo}</strong></li>
  <li>Total de números emitidos: <strong>${cartela.length}</strong></li>
  <li>Total de participantes: <strong>${participantes.length}</strong></li>
  <li>Número sorteado: <strong>#${sorteado.numero.toString().padStart(5, '0')}</strong></li>
  <li>Vencedor: ${emailVencedor ?? sorteado.user_id}</li>
  <li>Hash SHA-256: <code>${hash_sha256}</code></li>
  <li>Seed final: <code>${seedFinal}</code></li>
  <li>client_seed: <code>${client_seed}</code> · server_seed: <code>${commit.server_seed}</code></li>
  <li>Timestamp: ${executado_em}</li>
</ul>
<p><a href="https://3trevo.com.br/admin.html">Painel admin →</a></p>`,
      }),
    }).catch(() => {});
  }

  return Response.json({
    ok: true,
    numero_sorteado: sorteado.numero,
    winner_user_id: sorteado.user_id,
    winner_email: emailVencedor,
    total_numeros: cartela.length,
    total_participantes: participantes.length,
    hash_sha256,
    seed: seedFinal,
    client_seed,
    client_hash: commit.client_hash,
    server_seed: commit.server_seed,
    server_hash: commit.server_hash,
    executado_em,
  });
}

// ─── POST /api/admin/sorteio — rota antiga, aposentada ────────────────────────
// Não apagar silenciosamente: evita 404 confuso se algo antigo ainda apontar
// pra cá. Usava RNG só-servidor sem entrada verificável e gravava em colunas
// que não existem mais em draw_audits (quebrava com 500) — substituída pelo
// fluxo de 2 fases acima.
export async function handleSorteio(_request: Request, _env: Env): Promise<Response> {
  return Response.json(
    { ok: false, erro: 'rota_aposentada', detalhe: 'use POST /api/admin/sorteio/iniciar e /revelar' },
    { status: 410 }
  );
}
