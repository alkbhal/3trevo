/**
 * checkout.ts — Três Trevo Worker
 * Integração completa com Mercado Pago:
 *   POST /api/checkout/preferencia  — cria preferência MP + retorna init_point
 *   POST /api/webhook/pagamento     — recebe notificação MP, processa compra
 *   GET  /api/download              — entrega PDF via token UUID
 *
 * Secrets necessários:
 *   MP_ACCESS_TOKEN       — APP_USR-... do Mercado Pago (produção)
 *   WEBHOOK_HMAC_SECRET   — secret configurado no painel MP → Webhooks
 *   SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY
 */

import type { Env } from '../types';

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

const MP_API = 'https://api.mercadopago.com';
const SITE_URL = 'https://3trevo.com.br';
const WORKER_URL = 'https://tres-trevo-api.al-kbhal.workers.dev';

// ─── 1. Criar Preferência MP ─────────────────────────────────────────────────
export async function handleCriarPreferencia(request: Request, env: Env): Promise<Response> {
  if (!env.MP_ACCESS_TOKEN) {
    return Response.json({ ok: false, erro: 'gateway_nao_configurado' }, { status: 503 });
  }

  let body: any;
  try { body = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }

  const { slug, email } = body;
  if (!slug || !email) {
    return Response.json({ ok: false, erro: 'slug e email obrigatórios' }, { status: 400 });
  }
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug) || slug.length > 80) {
    return Response.json({ ok: false, erro: 'slug inválido' }, { status: 400 });
  }

  // Buscar produto no Supabase (catalogo é a fonte de verdade com 11 slugs)
  const prodResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/catalogo?slug=eq.${slug}&ativo=eq.true&select=slug,titulo,preco,cotas,autor`,
    { headers: supabaseHeaders(env) }
  );
  const [produto] = (await prodResp.json()) as any[];
  if (!produto) {
    return Response.json({ ok: false, erro: 'produto_nao_encontrado' }, { status: 404 });
  }

  // Criar preferência no MP
  const prefBody = {
    items: [{
      id: slug,
      title: produto.titulo,
      quantity: 1,
      unit_price: Number(produto.preco),
      currency_id: 'BRL',
    }],
    payer: { email },
    external_reference: slug,
    notification_url: `${WORKER_URL}/api/webhook/pagamento`,
    back_urls: {
      success: `${SITE_URL}/area-cliente.html?status=success&slug=${slug}`,
      failure: `${SITE_URL}/checkout.html?slug=${slug}&status=failed`,
      pending: `${SITE_URL}/area-cliente.html?status=pending`,
    },
    auto_return: 'approved',
    statement_descriptor: 'EDITORA TRES TREVO',
    payment_methods: {
      excluded_payment_types: [
        { id: 'ticket' },
        { id: 'atm' },
      ],
    },
  };

  const mpResp = await fetch(`${MP_API}/checkout/preferences`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(prefBody),
  });

  if (!mpResp.ok) {
    const err = await mpResp.text();
    console.error('[preferencia] erro MP:', err);
    return Response.json({ ok: false, erro: 'falha_ao_criar_preferencia' }, { status: 502 });
  }

  const pref = (await mpResp.json()) as any;
  return Response.json({
    ok: true,
    init_point: pref.init_point,       // URL de checkout MP (produção)
    sandbox_init_point: pref.sandbox_init_point,
    preference_id: pref.id,
  });
}

// ─── 2. Webhook MP ───────────────────────────────────────────────────────────
export async function handleWebhookPagamento(request: Request, env: Env): Promise<Response> {
  // MP envia GET para validação inicial da URL
  if (request.method === 'GET') return new Response('ok', { status: 200 });

  // Verificar assinatura MP (fail-closed: sem secret = 503)
  if (!env.WEBHOOK_HMAC_SECRET) {
    console.error('[webhook] WEBHOOK_HMAC_SECRET ausente — rejeitando');
    return new Response('Service Unavailable', { status: 503 });
  }
  const valido = await verificarAssinaturaMP(request.clone(), env.WEBHOOK_HMAC_SECRET);
  if (!valido) return new Response('Unauthorized', { status: 401 });

  let body: any;
  try { body = await request.clone().json(); } catch {
    return new Response('ok', { status: 200 }); // MP não deve retentar se for inválido
  }

  console.log('[webhook] recebido:', JSON.stringify(body));

  // Suporta IPN (?type=payment&id=) e Notifications (body.action + body.data.id)
  const topic = body?.type || body?.topic || body?.action?.split('.')?.[0] || '';
  const mpPaymentId = body?.data?.id || body?.id || null;

  if (!mpPaymentId || !['payment'].includes(topic)) {
    return new Response('ignored', { status: 200 });
  }

  // Buscar pagamento completo na API MP
  const mpPayment = await buscarPagamentoMP(String(mpPaymentId), env.MP_ACCESS_TOKEN ?? '');
  if (!mpPayment) {
    console.error('[webhook] falha ao buscar pagamento MP:', mpPaymentId);
    return new Response('mp_error', { status: 200 });
  }

  // Só processar aprovados
  if (mpPayment.status !== 'approved') {
    console.log('[webhook] status ignorado:', mpPayment.status);
    return new Response('not_approved', { status: 200 });
  }

  const productSlug = mpPayment.external_reference ?? '';
  const emailPagador = mpPayment.payer?.email ?? '';
  const nomePagador = mpPayment.payer?.first_name
    ? `${mpPayment.payer.first_name} ${mpPayment.payer.last_name ?? ''}`.trim()
    : emailPagador.split('@')[0];
  const valor = Number(mpPayment.transaction_amount ?? 0);
  const metodo = mpPayment.payment_type_id ?? 'unknown';

  if (!emailPagador || !productSlug) {
    console.error('[webhook] dados ausentes:', { emailPagador, productSlug });
    return new Response('dados_ausentes', { status: 200 });
  }

  // Encontrar ou criar usuário em auth.users
  const userId = await buscarOuCriarUsuario(emailPagador, nomePagador, env);

  // Registrar compra via RPC
  const rpc = await registrarCompraMp({
    env,
    userId: userId ?? null,
    mpPaymentId: String(mpPaymentId),
    productSlug,
    valor,
    metodo,
    rawMp: mpPayment,
  });

  if (!rpc.ok) {
    console.error('[webhook] rpc falhou:', rpc.erro);
    await registrarAuditoria(env, 'webhook_erro', { mpPaymentId, erro: rpc.erro });
    return new Response('rpc_error', { status: 200 });
  }

  // Novo pedido: distribuir números + enviar email
  if (rpc.novo) {
    await distribuirNumeros(env, {
      userId: userId!,
      purchaseId: rpc.purchase_id,
      quantidade: rpc.cotas_base ?? 0,
    });

    if (env.RESEND_API_KEY) {
      await enviarEmailCompra(env, {
        email: emailPagador,
        nome: nomePagador,
        ebookTitulo: rpc.ebook_titulo ?? productSlug,
        downloadToken: rpc.download_token,
        productSlug,
        cotas: rpc.cotas_base ?? 0,
        valor,
      }).catch(err => console.error('[webhook] email falhou:', err));
    }
  }

  await registrarAuditoria(env, 'webhook_pagamento', {
    mp_payment_id: mpPaymentId,
    purchase_id: rpc.purchase_id,
    novo: rpc.novo,
  });

  return Response.json({ ok: true });
}

// ─── 3. Download (UUID token) ─────────────────────────────────────────────────
export async function handleDownload(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) return new Response('Link inválido', { status: 400 });

  // Buscar token na tabela downloads
  const resp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/downloads?token=eq.${token}&select=id,product_id,expira_em,usado_em,download_count`,
    { headers: supabaseHeaders(env) }
  );
  const [dl] = (await resp.json()) as any[];

  if (!dl) return new Response('Link inválido ou expirado', { status: 404 });
  if (new Date(dl.expira_em) < new Date()) {
    return new Response('Link expirado. Contate sac@3trevo.com.br para renovação.', { status: 410 });
  }

  // Atomic check + increment — evita TOCTOU no limite de downloads
  const incrResp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/increment_download_count`, {
    method: 'POST',
    headers: { ...supabaseHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ dl_id: dl.id, dl_ip: request.headers.get('cf-connecting-ip') ?? '' }),
  });
  if (!incrResp.ok || (await incrResp.json()) !== true) {
    return new Response('Limite de downloads atingido. Contate sac@3trevo.com.br.', { status: 403 });
  }

  // Buscar arquivo do produto
  const prodResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/products?id=eq.${dl.product_id}&select=arquivo_url,titulo`,
    { headers: supabaseHeaders(env) }
  );
  const [produto] = (await prodResp.json()) as any[];
  if (!produto?.arquivo_url) {
    return new Response('Arquivo não configurado', { status: 404 });
  }

  // Redirecionar para R2 público (ou URL pré-assinada)
  if (!env.R2_PUBLIC_BUCKET_ID) {
    return Response.json({ ok: false, erro: 'r2_not_configured' }, { status: 500 });
  }
  const pdfUrl = produto.arquivo_url.startsWith('http')
    ? produto.arquivo_url
    : `https://pub-${env.R2_PUBLIC_BUCKET_ID}.r2.dev/${produto.arquivo_url}`;

  return Response.redirect(pdfUrl, 302);
}

// ─── Helpers: MP API ─────────────────────────────────────────────────────────
async function buscarPagamentoMP(paymentId: string, accessToken: string): Promise<any | null> {
  try {
    const resp = await fetch(`${MP_API}/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// Verifica assinatura MP x-signature: ts=...,v1=...
async function verificarAssinaturaMP(request: Request, secret: string): Promise<boolean> {
  const xSig = request.headers.get('x-signature') ?? '';
  const xReqId = request.headers.get('x-request-id') ?? '';
  const body = await request.clone().json() as any;
  const mpId = body?.data?.id ?? body?.id ?? '';

  // Extrair ts e v1 do header
  const ts = xSig.match(/ts=([^,]+)/)?.[1] ?? '';
  const v1 = xSig.match(/v1=([^,]+)/)?.[1] ?? '';

  const tsNum = parseInt(ts, 10);
  const agora = Math.floor(Date.now() / 1000);
  if (isNaN(tsNum) || Math.abs(agora - tsNum) > 300) {
    return false; // timestamp ausente ou fora da janela de 5 minutos
  }

  if (!ts || !v1 || !mpId) {
    // Fallback: aceitar se secret não está configurado (dev)
    return !secret;
  }

  const message = `id:${mpId};request-id:${xReqId};ts:${ts}`;
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  return timingSafeEqualHex(v1, expected);
}

// ponytail: mesmo helper em forge-webhook.ts — duplicado pra evitar novo
// arquivo compartilhado só por 2 call sites (CLAUDE.md: "prefer editing existing files")
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── Helpers: Supabase Auth ───────────────────────────────────────────────────
async function buscarOuCriarUsuario(email: string, nome: string, env: Env): Promise<string | null> {
  const authUrl = `${env.SUPABASE_URL}/auth/v1/admin/users`;
  const headers = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Tentar criar (idempotente — retorna 422 se já existe)
  const createResp = await fetch(authUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: { nome },
    }),
  });

  if (createResp.ok) {
    const user = (await createResp.json()) as any;
    return user.id;
  }

  // Usuário já existe — buscar pelo email
  const listResp = await fetch(`${authUrl}?email=${encodeURIComponent(email)}`, { headers });
  if (!listResp.ok) {
    console.error('[auth] falha ao buscar usuário:', await listResp.text());
    return null;
  }
  const data = (await listResp.json()) as any;
  const users: any[] = data.users ?? (Array.isArray(data) ? data : []);
  const found = users.find((u: any) => u.email === email);
  return found?.id ?? null;
}

// ─── Helpers: RPC registrar_compra_mp ────────────────────────────────────────
async function registrarCompraMp(opts: {
  env: Env;
  userId: string | null;
  mpPaymentId: string;
  productSlug: string;
  valor: number;
  metodo: string;
  rawMp: object;
}): Promise<any> {
  const { env, userId, mpPaymentId, productSlug, valor, metodo, rawMp } = opts;
  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/registrar_compra_mp`, {
    method: 'POST',
    headers: { ...supabaseHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_user_id: userId,
      p_mp_payment_id: mpPaymentId,
      p_product_slug: productSlug,
      p_valor: valor,
      p_metodo: metodo,
      p_raw_mp: rawMp,
    }),
  });
  return (await resp.json()) as any;
}

// ─── Helpers: Draw numbers ────────────────────────────────────────────────────
async function distribuirNumeros(
  env: Env,
  opts: { userId: string; purchaseId: string; quantidade: number }
): Promise<void> {
  if (opts.quantidade <= 0) return;

  // Buscar draw ativo
  const drawResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/draws?status=eq.open&order=criado_em.desc&limit=1`,
    { headers: supabaseHeaders(env) }
  );
  const [draw] = (await drawResp.json()) as any[];
  if (!draw) return;

  // Criar draw_entry
  await fetch(`${env.SUPABASE_URL}/rest/v1/draw_entries`, {
    method: 'POST',
    headers: { ...supabaseHeaders(env), 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify({
      draw_id: draw.id,
      user_id: opts.userId,
      purchase_id: opts.purchaseId,
      cotas_base: opts.quantidade,
      cotas_bonus: 0,
      qualificado: false,
    }),
  });

  // Buscar números já atribuídos
  const existResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/draw_numbers?draw_id=eq.${draw.id}&select=numero`,
    { headers: supabaseHeaders(env) }
  );
  const existentes = (await existResp.json()) as any[];
  const ocupados = new Set(existentes.map((n: any) => n.numero));

  const max = draw.max_numeros ?? 100000;
  if (ocupados.size >= max) {
    console.error(`[draw] All ${max} numbers allocated for draw ${draw.id}`);
    return;
  }
  const novos: number[] = [];
  let tentativas = 0;
  while (novos.length < opts.quantidade && tentativas < opts.quantidade * 100) {
    tentativas++;
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const n = (buf[0] % max) + 1;
    if (!ocupados.has(n)) {
      novos.push(n);
      ocupados.add(n);
    }
  }

  if (novos.length > 0) {
    const rows = novos.map(n => ({
      draw_id: draw.id,
      numero: n,
      user_id: opts.userId,
      origem: 'purchase',
      purchase_id: opts.purchaseId,
    }));
    await fetch(`${env.SUPABASE_URL}/rest/v1/draw_numbers`, {
      method: 'POST',
      headers: { ...supabaseHeaders(env), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(rows),
    });
  }
}

// ─── Email de compra ───────────────────────────────────────────────────────────
async function enviarEmailCompra(
  env: Env,
  opts: {
    email: string;
    nome: string;
    ebookTitulo: string;
    downloadToken: string;
    productSlug: string;
    cotas: number;
    valor: number;
  }
): Promise<void> {
  const downloadUrl = `${WORKER_URL}/api/download?token=${opts.downloadToken}`;
  const participacaoUrl = `${SITE_URL}/participacao-cultural.html?slug=${opts.productSlug}`;
  const valorFmt = 'R$ ' + opts.valor.toFixed(2).replace('.', ',');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f0ebe0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ebe0;padding:40px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fdfbf7;border:1px solid rgba(26,74,46,.12)">
  <tr><td style="height:4px;background:linear-gradient(90deg,#1a4a2e,#c8a84b)"></td></tr>
  <tr><td style="padding:32px 48px 24px;border-bottom:1px solid rgba(26,74,46,.08)">
    <p style="margin:0;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#1a4a2e">✦ Editora Três Trevo</p>
  </td></tr>
  <tr><td style="padding:36px 48px 0">
    <h1 style="margin:0 0 12px;font-size:28px;font-weight:300;color:#0f2d1a">
      Olá, <em style="font-style:italic;color:#1a4a2e">${escapeHtml(opts.nome.split(' ')[0])}</em> —
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#555;line-height:1.7">
      Seu pagamento foi aprovado. <strong>${escapeHtml(opts.ebookTitulo)}</strong> está pronto para leitura.
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#888">
      Valor pago: <strong style="color:#1a4a2e">${valorFmt}</strong> &nbsp;·&nbsp;
      ${opts.cotas} cota${opts.cotas !== 1 ? 's' : ''} no Programa Cultural
    </p>
  </td></tr>

  <!-- Download CTA -->
  <tr><td style="padding:28px 48px">
    <p style="margin:0 0 12px;font-size:12px;color:#888">Link válido por 72 horas:</p>
    <a href="${downloadUrl}"
       style="display:block;padding:18px;background:#1a4a2e;color:#f0ebe0;text-decoration:none;
              text-align:center;font-size:15px;font-weight:500">
      Baixar ${escapeHtml(opts.ebookTitulo)} →
    </a>
  </td></tr>

  <!-- Biblioteca TT -->
  <tr><td style="padding:0 48px 24px">
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f5f0e8;border:1px solid rgba(26,74,46,.1);border-left:3px solid #c8a84b">
    <tr><td style="padding:16px 20px">
      <p style="margin:0 0 4px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8a6f28">📚 Biblioteca Clássica TT</p>
      <p style="margin:0 0 10px;font-size:13px;color:#444;line-height:1.6">
        Sua compra inclui acesso ao acervo de clássicos — Dom Casmurro, Memórias Póstumas e mais,
        com leitor integrado e até 3 leituras simultâneas.
      </p>
      <a href="${SITE_URL}/minha-biblioteca.html"
         style="font-size:13px;color:#1a4a2e;font-weight:600;text-decoration:none">
        Acessar biblioteca → (use este e-mail para entrar)
      </a>
    </td></tr>
    </table>
  </td></tr>

  <!-- Programa Cultural -->
  <tr><td style="padding:0 48px 28px">
    <table width="100%" cellpadding="0" cellspacing="0"
           style="background:#f0f7f2;border:1px solid rgba(26,74,46,.15)">
    <tr><td style="padding:16px 20px">
      <p style="margin:0 0 8px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#1a4a2e">✦ Programa Cultural</p>
      <p style="margin:0;font-size:13px;color:#444;line-height:1.6">
        Após 7 dias, acesse
        <a href="${participacaoUrl}" style="color:#1a4a2e;font-weight:600;text-decoration:none">
          sua página de participação →
        </a>
        , escreva um depoimento sobre o livro e suas cotas são liberadas para o sorteio.
      </p>
    </td></tr>
    </table>
  </td></tr>

  <!-- Rodapé -->
  <tr><td style="padding:20px 48px;border-top:1px solid rgba(26,74,46,.08)">
    <p style="margin:0;font-size:11px;color:#999;line-height:1.6">
      <a href="${SITE_URL}" style="color:#1a4a2e;text-decoration:none">3trevo.com.br</a> ·
      <a href="mailto:sac@3trevo.com.br" style="color:#1a4a2e;text-decoration:none">sac@3trevo.com.br</a> ·
      WhatsApp: <a href="https://wa.me/5554999467085" style="color:#1a4a2e;text-decoration:none">(54) 99946-7085</a><br>
      CNPJ 18.928.966/0001-59 · Montauri/RS · © ${new Date().getFullYear()} Editora Três Trevo
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Editora Três Trevo <sac@3trevo.com.br>',
      to: opts.email,
      subject: `✦ Seu ebook "${opts.ebookTitulo}" chegou — Editora Três Trevo`,
      html,
    }),
  });
}

// ─── Utilitários ─────────────────────────────────────────────────────────────
function supabaseHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  };
}

async function registrarAuditoria(env: Env, action: string, details: object): Promise<void> {
  await fetch(`${env.SUPABASE_URL}/rest/v1/audit_log`, {
    method: 'POST',
    headers: {
      ...supabaseHeaders(env),
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ action_type: action, actor: 'worker', status: 'ok', details }),
  }).catch(() => {});
}
