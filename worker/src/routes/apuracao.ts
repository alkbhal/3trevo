/**
 * apuracao.ts — Três Trevo Worker
 * Admin-only: apuração por Loteria Federal + email ao vencedor
 *
 * POST /api/admin/apuracao       — disparar apuração com dados do concurso LF
 * GET  /api/admin/fila           — depoimentos aguardando revisão manual
 * POST /api/admin/moderar        — aprovar/rejeitar depoimento
 *
 * Deploy: copiar/substituir worker/src/routes/apuracao.ts
 */

import type { Env } from '../types';

// ─── Verificação de token admin ───────────────────────────────────────────────
async function verificarAdmin(request: Request, env: Env): Promise<boolean> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return false;

  // Verificar sessão no Supabase
  const resp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/admin_sessoes?token=eq.${encodeURIComponent(token)}&ativa=eq.true&select=token,expira_em`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const rows = (await resp.json()) as any[];
  if (!rows.length) return false;

  const expira = new Date(rows[0].expira_em).getTime();
  return Date.now() < expira;
}

// ─── Email para o vencedor ────────────────────────────────────────────────────
async function enviarEmailVencedor(
  env: Env,
  opts: {
    email: string;
    nome: string;
    draw_titulo: string;
    cota_vencedora: string;
    lf_concurso: number;
    hash_evidencia: string;
  }
): Promise<void> {
  if (!env.RESEND_API_KEY) return;

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
          Olá, <strong>${opts.nome.split(' ')[0]}</strong> —
        </p>
        <p style="color:#2d2d2d;font-size:16px;line-height:1.7;margin:0 0 24px;">
          Sua cota foi sorteada no <strong>${opts.draw_titulo}</strong>.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f9f5;border-radius:4px;margin:0 0 32px;">
          <tr><td style="padding:24px;">
            <p style="margin:0 0 8px;color:#1e5c3a;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Concurso Loteria Federal</p>
            <p style="margin:0 0 4px;color:#2d2d2d;font-size:20px;font-weight:bold;">#${opts.lf_concurso}</p>
            <p style="margin:8px 0 0;color:#555;font-size:14px;">Cota vencedora: <strong>${opts.cota_vencedora}</strong></p>
          </td></tr>
        </table>

        <p style="color:#4a4a4a;font-size:15px;line-height:1.7;margin:0 0 16px;">
          Entre em contato para receber seu prêmio via PIX em até 7 dias úteis.
        </p>

        <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0 0 32px;">
          <a href="mailto:sac@3trevo.com.br?subject=Prêmio%20${opts.draw_titulo}"
             style="display:inline-block;background:#1e5c3a;color:#fff;text-decoration:none;
                    padding:16px 32px;border-radius:3px;font-size:15px;">
            Confirmar recebimento →
          </a>
        </td></tr></table>

        <hr style="border:none;border-top:1px solid #e8e8e4;margin:0 0 24px;">
        <p style="color:#888;font-size:12px;line-height:1.6;margin:0;">
          Hash de auditoria (SHA-256): <code style="font-size:10px;">${opts.hash_evidencia}</code><br>
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
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Editora Três Trevo <sac@3trevo.com.br>',
      to: opts.email,
      subject: `Você ganhou no Programa Cultural — ${opts.draw_titulo}`,
      html,
    }),
  });
}

// ─── POST /api/admin/apuracao ─────────────────────────────────────────────────
export async function handleApuracao(request: Request, env: Env): Promise<Response> {
  if (!(await verificarAdmin(request, env))) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: any;
  try { body = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }

  const { draw_id, lf_concurso, premios, testemunha_1, testemunha_2, certificado } = body ?? {};

  // Validação mínima
  if (!draw_id || !lf_concurso || !Array.isArray(premios) || premios.length !== 5) {
    return Response.json({
      ok: false,
      erro: 'draw_id, lf_concurso e premios[5] são obrigatórios',
    }, { status: 400 });
  }

  // Chamar RPC de apuração
  const rpcResp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/apurar_sorteio_lf`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_draw_id: draw_id,
      p_lf_concurso: lf_concurso,
      p_premios: premios,
      p_testemunha_1: testemunha_1 ?? null,
      p_testemunha_2: testemunha_2 ?? null,
      p_certificado: certificado ?? null,
    }),
  });

  const resultado = (await rpcResp.json()) as any;

  if (!resultado.ok) {
    return Response.json(resultado, { status: 400 });
  }

  // Buscar dados do draw para o email
  const drawResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/draws?id=eq.${draw_id}&select=titulo`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const [draw] = (await drawResp.json()) as any[];

  // Enviar email ao vencedor se houver email
  if (resultado.winner_email && env.RESEND_API_KEY) {
    try {
      await enviarEmailVencedor(env, {
        email: resultado.winner_email,
        nome: resultado.winner_email.split('@')[0], // fallback se não tiver nome
        draw_titulo: draw?.titulo ?? 'Programa Cultural',
        cota_vencedora: resultado.cota_vencedora,
        lf_concurso: lf_concurso,
        hash_evidencia: resultado.hash_evidencia,
      });
    } catch (err) {
      console.error('[apuracao] email vencedor falhou:', err);
    }
  }

  // Notificar Dias sobre resultado
  if (env.RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'sistema@3trevo.com.br',
        to: 'rogerio.kbhal@gmail.com',
        subject: `[Três Trevo] Apuração concluída — Concurso LF #${lf_concurso}`,
        html: `<p>Apuração da Rodada concluída com sucesso.</p>
<ul>
  <li>Concurso LF: #${lf_concurso}</li>
  <li>Cota vencedora: <strong>${resultado.cota_vencedora}</strong></li>
  <li>Vencedor: ${resultado.winner_email ?? 'sem vencedor (cota não emitida)'}</li>
  <li>Hash SHA-256: <code>${resultado.hash_evidencia}</code></li>
</ul>
<p><a href="https://3trevo.com.br/admin.html#apuracao">Ver auditoria →</a></p>`,
      }),
    }).catch(() => {});
  }

  return Response.json(resultado);
}

// ─── GET /api/admin/fila ──────────────────────────────────────────────────────
export async function handleFilaRevisao(request: Request, env: Env): Promise<Response> {
  if (!(await verificarAdmin(request, env))) return new Response('Unauthorized', { status: 401 });

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
  if (!(await verificarAdmin(request, env))) return new Response('Unauthorized', { status: 401 });

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
