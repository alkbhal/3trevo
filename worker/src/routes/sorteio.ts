/**
 * sorteio.ts — Três Trevo Worker
 * Admin-only: sorteio puro interno (RNG sem vínculo com Loteria Federal)
 *
 * POST /api/admin/sorteio  — disparar sorteio manual (ou automático por meta atingida)
 *
 * Input:  { draw_id, testemunha_1?, testemunha_2?, certificado_numero? }
 * Output: { ok, numero_sorteado, winner_user_id, winner_email, total_numeros,
 *           total_participantes, hash_sha256, seed, executado_em }
 *
 * Auditoria: draw_audits registra seed, algoritmo, cartela snapshot, hash SHA-256.
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

// ─── POST /api/admin/sorteio ──────────────────────────────────────────────────
export async function handleSorteio(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: any;
  try { body = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }

  const { draw_id, testemunha_1, testemunha_2, certificado_numero } = body ?? {};
  if (!draw_id) {
    return Response.json({ ok: false, erro: 'draw_id é obrigatório' }, { status: 400 });
  }

  // 1. Buscar draw aberto
  const drawResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/draws?id=eq.${draw_id}&status=eq.open&select=id,titulo,max_numeros,premio_1`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const [draw] = (await drawResp.json()) as any[];
  if (!draw) {
    return Response.json({ ok: false, erro: 'draw_nao_encontrado_ou_fechado' }, { status: 400 });
  }

  // 2. Buscar cartela completa (todos os números emitidos)
  const numResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/draw_numbers?draw_id=eq.${draw_id}&select=numero,user_id,origem`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const cartela = (await numResp.json()) as Array<{ numero: number; user_id: string; origem: string }>;
  if (!cartela.length) {
    return Response.json({ ok: false, erro: 'nenhum_numero_emitido' }, { status: 400 });
  }

  // 3. Gerar seed criptográfico
  const seedBuf = new Uint8Array(16);
  crypto.getRandomValues(seedBuf);
  const seed = Array.from(seedBuf).map(b => b.toString(16).padStart(2, '0')).join('');

  // 4. Derivar índice via SHA-256 do seed (reproduzível e auditável)
  const idxBuf = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${seed}:${cartela.length}`))
  );
  const idxBig = idxBuf.slice(0, 8).reduce((acc, byte) => (acc << 8n) | BigInt(byte), 0n);
  const idx = Number(idxBig % BigInt(cartela.length));
  const sorteado = cartela[idx];

  const executado_em = new Date().toISOString();

  // 5. Buscar email do vencedor
  const emailVencedor = await getEmailUsuario(env, sorteado.user_id);

  // 6. Snapshot de participantes (agrupado por user_id)
  const userCount = new Map<string, number>();
  for (const n of cartela) {
    userCount.set(n.user_id, (userCount.get(n.user_id) ?? 0) + 1);
  }
  const participantes = Array.from(userCount.entries()).map(([uid, total]) => ({
    user_id: uid,
    total_numeros: total,
  }));

  // 7. Hash SHA-256 de auditoria (prova do resultado: não pode ser forjado sem o seed)
  const auditPayload = `${draw_id}:${seed}:${sorteado.numero}:${sorteado.user_id}:${executado_em}`;
  const hash_sha256 = await sha256hex(auditPayload);

  const resultado = [{
    posicao: 1,
    user_id: sorteado.user_id,
    numero_sorteado: sorteado.numero,
    email_masked: emailVencedor ? mascararEmail(emailVencedor) : null,
    testemunha_1: testemunha_1 ?? null,
    testemunha_2: testemunha_2 ?? null,
    certificado_numero: certificado_numero ?? null,
  }];

  // 8-10. Registrar resultado atomicamente via RPC (audit + winner + fechar draw em 1 transação)
  const rpcResp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/registrar_resultado_sorteio`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_draw_id: draw_id,
      p_seed: seed,
      p_algoritmo: 'rng-web-crypto-sha256',
      p_numero_sorteado: sorteado.numero,
      p_user_id: sorteado.user_id,
      p_cartela: cartela.map(n => ({ numero: n.numero, user_id: n.user_id, origem: n.origem })),
      p_participantes: participantes,
      p_resultado: resultado,
      p_hash_sha256: hash_sha256,
      p_executado_em: executado_em,
      p_premio: draw.premio_1 ?? null,
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

  // 11. Email ao vencedor
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

  // 12. Notificar admin
  if (env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'sistema@3trevo.com.br',
        to: 'rogerio.kbhal@gmail.com',
        subject: `[Três Trevo] ✦ Sorteio concluído — ${draw.titulo}`,
        html: `<p>Sorteio concluído com sucesso.</p>
<ul>
  <li>Draw: <strong>${draw.titulo}</strong></li>
  <li>Total de números emitidos: <strong>${cartela.length}</strong></li>
  <li>Total de participantes: <strong>${participantes.length}</strong></li>
  <li>Número sorteado: <strong>#${sorteado.numero.toString().padStart(5, '0')}</strong></li>
  <li>Vencedor: ${emailVencedor ?? sorteado.user_id}</li>
  <li>Hash SHA-256: <code>${hash_sha256}</code></li>
  <li>Seed RNG: <code>${seed}</code></li>
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
    seed,
    executado_em,
  });
}
