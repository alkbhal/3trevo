/**
 * checkout.ts — Três Trevo Worker
 * Webhook de pagamento confirmado
 *
 * POST /api/webhook/pagamento  — recebe notificação de pagamento, cria pedido + draw_entry, envia email
 *
 * Deploy: copiar/substituir worker/src/routes/checkout.ts
 * Secrets necessários: SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, WEBHOOK_HMAC_SECRET
 */

import type { Env } from '../types';

// ─── Verificação HMAC (Mercado Pago / Rifei / qualquer webhook) ──────────────
async function verificarHMAC(request: Request, secret: string): Promise<boolean> {
  const signature = request.headers.get('x-signature') ||
                    request.headers.get('x-hub-signature-256') ||
                    request.headers.get('x-webhook-signature') || '';

  const body = await request.clone().text();
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expected = 'sha256=' + Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

  // Comparação timing-safe simplificada
  if (signature.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < signature.length; i++) {
    diff |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

// ─── Email de download via Resend ────────────────────────────────────────────
async function enviarEmailDownload(
  env: Env,
  opts: {
    email: string;
    nome: string;
    ebook_titulo: string;
    ebook_slug: string;
    pedido_id: string;
    download_url: string;
  }
): Promise<void> {
  const participacao_url =
    `https://3trevo.com.br/participacao-cultural.html?pedido_id=${opts.pedido_id}&slug=${opts.ebook_slug}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8f8f6;font-family:Georgia,serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f6;">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:4px;overflow:hidden;">
      <!-- Cabeçalho -->
      <tr><td style="background:#0f2d1a;padding:32px 40px;">
        <p style="margin:0;color:#a8c5a0;font-size:11px;letter-spacing:3px;text-transform:uppercase;">Editora Três Trevo</p>
        <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:400;">Seu ebook chegou.</h1>
      </td></tr>

      <!-- Corpo -->
      <tr><td style="padding:40px;">
        <p style="color:#2d2d2d;font-size:16px;line-height:1.7;margin:0 0 24px;">
          Olá, <strong>${opts.nome.split(' ')[0]}</strong> —
        </p>
        <p style="color:#2d2d2d;font-size:16px;line-height:1.7;margin:0 0 32px;">
          <strong>${opts.ebook_titulo}</strong> está pronto para leitura.
          O link abaixo é exclusivo e expira em 72 horas.
        </p>

        <!-- CTA Download -->
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0 0 32px;">
          <a href="${opts.download_url}"
             style="display:inline-block;background:#1e5c3a;color:#fff;text-decoration:none;
                    padding:16px 40px;border-radius:3px;font-size:15px;letter-spacing:0.5px;">
            Baixar ebook →
          </a>
        </td></tr></table>

        <!-- Divisor -->
        <hr style="border:none;border-top:1px solid #e8e8e4;margin:0 0 32px;">

        <!-- Programa Cultural -->
        <p style="color:#0f2d1a;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0 0 12px;">
          ✦ Programa Cultural
        </p>
        <p style="color:#4a4a4a;font-size:15px;line-height:1.7;margin:0 0 20px;">
          Após a leitura (7 dias), você recebe o link de participação automaticamente.
          Escreva um depoimento genuíno e concorra a prêmios em dinheiro.
        </p>
        <p style="color:#4a4a4a;font-size:15px;line-height:1.7;margin:0 0 32px;">
          Suas cotas valem em todas as 6 rodadas desta série.
        </p>

        <!-- CTA Participação (disponível após 7 dias) -->
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
          <a href="${participacao_url}"
             style="display:inline-block;border:1px solid #1e5c3a;color:#1e5c3a;text-decoration:none;
                    padding:13px 32px;border-radius:3px;font-size:14px;">
            Acessar participação →
          </a>
        </td></tr></table>
      </td></tr>

      <!-- Rodapé -->
      <tr><td style="background:#f0f0ec;padding:24px 40px;">
        <p style="color:#888;font-size:12px;line-height:1.6;margin:0;">
          Editora Três Trevo · CNPJ 18.928.966/0001-59 · Montauri/RS<br>
          Dúvidas: <a href="mailto:sac@3trevo.com.br" style="color:#1e5c3a;">sac@3trevo.com.br</a> ·
          WhatsApp: <a href="https://wa.me/5554999467085" style="color:#1e5c3a;">(54) 99946-7085</a><br>
          <a href="https://3trevo.com.br/termos-programa-cultural.html" style="color:#888;">Regulamento do Programa Cultural</a>
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
      subject: `Seu ebook "${opts.ebook_titulo}" chegou — Editora Três Trevo`,
      html,
    }),
  });
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function handleWebhookPagamento(request: Request, env: Env): Promise<Response> {
  // Verificar HMAC se secret configurado
  if (env.WEBHOOK_HMAC_SECRET) {
    const valid = await verificarHMAC(request, env.WEBHOOK_HMAC_SECRET);
    if (!valid) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  // Extrair campos comuns entre gateways (Mercado Pago, Kiwify, Hotmart)
  const nome       = payload.buyer?.name       ?? payload.customer?.name       ?? payload.nome       ?? '';
  const email      = payload.buyer?.email      ?? payload.customer?.email      ?? payload.email      ?? '';
  const telefone   = payload.buyer?.phone      ?? payload.customer?.phone      ?? payload.telefone   ?? '';
  const ebook_slug = payload.product?.slug     ?? payload.ebook_slug           ?? payload.slug       ?? '';
  const valor_pago = payload.payment?.amount   ?? payload.amount               ?? payload.valor      ?? 0;
  const id_externo = payload.id                ?? payload.payment?.id          ?? payload.order_id   ?? '';

  if (!email || !ebook_slug || !id_externo) {
    return Response.json({ ok: false, erro: 'campos obrigatórios ausentes' }, { status: 400 });
  }

  // Criar pedido + draw_entry via RPC
  const rpcResp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/upsert_cliente_pedido`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_nome: nome,
      p_email: email,
      p_telefone: telefone,
      p_ebook_slug: ebook_slug,
      p_valor_pago: valor_pago,
      p_id_externo: id_externo,
    }),
  });

  const rpc = (await rpcResp.json()) as any;

  if (!rpc.ok) {
    // Log falha mas responde 200 para não reenviar o webhook
    console.error('[webhook] upsert falhou:', rpc.erro);
    await registrarAuditoria(env, 'webhook_erro', { id_externo, erro: rpc.erro });
    return Response.json({ ok: false, erro: rpc.erro }, { status: 200 });
  }

  // Novo pedido: gerar link de download e enviar email
  if (rpc.novo_pedido && env.RESEND_API_KEY) {
    try {
      // Gerar token de download (gravar em downloads via supabase se houver user_id, senão usar pedido_id como token temporário)
      const download_url = `https://tres-trevo-api.al-kbhal.workers.dev/api/download?pedido_id=${rpc.pedido_id}&token=${await gerarTokenDownload(rpc.pedido_id, env.WEBHOOK_HMAC_SECRET)}`;

      await enviarEmailDownload(env, {
        email,
        nome,
        ebook_titulo: rpc.ebook_titulo ?? ebook_slug,
        ebook_slug,
        pedido_id: rpc.pedido_id,
        download_url,
      });

      // Marcar email como enviado
      await fetch(`${env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${rpc.pedido_id}`, {
        method: 'PATCH',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email_enviado: true, email_enviado_em: new Date().toISOString() }),
      });
    } catch (err) {
      console.error('[webhook] email falhou:', err);
      // Alertar Dias sobre falha de email
      await alertarFalhaEmail(env, { email, ebook_slug, pedido_id: rpc.pedido_id, erro: String(err) }).catch(() => {});
    }
  }

  await registrarAuditoria(env, 'webhook_pagamento', {
    pedido_id: rpc.pedido_id,
    draw_entry_id: rpc.draw_entry_id,
    novo: rpc.novo_pedido,
    cotas: rpc.cotas_base,
  });

  return Response.json({ ok: true, pedido_id: rpc.pedido_id, draw_entry_id: rpc.draw_entry_id });
}

// ─── Handler: GET /api/download ───────────────────────────────────────────────
export async function handleDownload(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pedido_id = url.searchParams.get('pedido_id');
  const token = url.searchParams.get('token');

  if (!pedido_id || !token) {
    return new Response('Link inválido', { status: 400 });
  }

  // Verificar token (tenta com segredo primeiro; fallback sem segredo para links legados)
  const expectedNew = await gerarTokenDownload(pedido_id, env.WEBHOOK_HMAC_SECRET);
  const expectedLegacy = await gerarTokenDownload(pedido_id);
  if (token !== expectedNew && token !== expectedLegacy) {
    return new Response('Link expirado ou inválido', { status: 401 });
  }

  // Buscar ebook_slug do pedido
  const pedidoResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/pedidos?id=eq.${pedido_id}&select=ebook_slug,criado_em`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const [pedido] = (await pedidoResp.json()) as any[];

  if (!pedido) return new Response('Pedido não encontrado', { status: 404 });

  // Verificar expiração (72h)
  const criado = new Date(pedido.criado_em).getTime();
  if (Date.now() - criado > 72 * 3600 * 1000) {
    return new Response('Link expirado. Contate sac@3trevo.com.br para renovação.', { status: 410 });
  }

  // Buscar URL do PDF via catalogo
  const catalogoResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/catalogo?slug=eq.${pedido.ebook_slug}&select=pdf_nome`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const [produto] = (await catalogoResp.json()) as any[];
  const pdf_nome = produto?.pdf_nome;
  if (!pdf_nome) return new Response('Arquivo não configurado', { status: 404 });

  // Redirecionar para R2 (URL pré-assinada ou direta)
  const pdf_url = `https://pub-${env.R2_PUBLIC_BUCKET_ID ?? 'CONFIGURE'}.r2.dev/${pdf_nome}`;
  return Response.redirect(pdf_url, 302);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function gerarTokenDownload(pedido_id: string, secret?: string): Promise<string> {
  const encoder = new TextEncoder();
  if (secret) {
    // HMAC-SHA256 com segredo — token não previsível sem a chave
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode('tt-dl:' + pedido_id));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
  }
  // Fallback sem segredo (deploy sem WEBHOOK_HMAC_SECRET configurado)
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode('tt-download-' + pedido_id));
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

async function registrarAuditoria(env: Env, action: string, details: object): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/audit_log`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ action_type: action, actor: 'worker', status: 'ok', details }),
  });
}

async function alertarFalhaEmail(env: Env, ctx: any): Promise<void> {
  if (!env.RESEND_API_KEY) return;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'sistema@3trevo.com.br',
      to: 'rogerio.kbhal@gmail.com',
      subject: '[ALERTA] Falha ao enviar email de download',
      html: `<p>Pedido: ${ctx.pedido_id}<br>Email: ${ctx.email}<br>Ebook: ${ctx.ebook_slug}<br>Erro: ${ctx.erro}</p>`,
    }),
  });
}
