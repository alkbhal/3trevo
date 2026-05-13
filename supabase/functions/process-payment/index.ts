// supabase/functions/process-payment/index.ts
// Edge Function: processa pagamento via MercadoPago Payment Brick
// POST { product_id, token, payment_method_id, installments, issuer_id, payer: {...} }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL        = Deno.env.get("SITE_URL") ?? "https://3trevo.com.br";
const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL      = Deno.env.get("FROM_EMAIL") ?? "sac@3trevo.com.br";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Autenticar usuário ────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb    = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sb.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Ler body — formData do Brick + product_id ─────────
    const body = await req.json();
    const { product_id, ...formData } = body;

    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Buscar produto ────────────────────────────────────
    const { data: product, error: prodError } = await sb
      .from("products")
      .select("id, titulo, preco, cotas, genero, autor, slug")
      .eq("id", product_id)
      .eq("ativo", true)
      .single();

    if (prodError || !product) {
      return new Response(JSON.stringify({ error: "Produto não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Criar registro payment (pending) ──────────────────
    const { data: payment, error: payError } = await sb
      .from("payments")
      .insert({
        user_id:       user.id,
        product_id:    product.id,
        status:        "pending",
        valor:         product.preco,
        email_pagador: user.email,
      })
      .select("id")
      .single();

    if (payError || !payment) {
      console.error("Erro ao criar payment:", payError);
      return new Response(JSON.stringify({ error: "Erro interno ao criar pagamento" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Chamar MP /v1/payments ────────────────────────────
    const mpPayload = {
      ...formData,
      transaction_amount:   Number(product.preco),
      description:          product.titulo,
      installments:         formData.installments || 1,
      statement_descriptor: "TRES TREVO",
      external_reference:   payment.id,
      notification_url:     `${SUPABASE_URL}/functions/v1/mp-webhook`,
    };

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "Authorization":     `Bearer ${MP_ACCESS_TOKEN}`,
        "X-Idempotency-Key": payment.id,
      },
      body: JSON.stringify(mpPayload),
    });

    const mpData = await mpRes.json();

    // ── 6. Tratar resposta do MP ─────────────────────────────
    if (!mpRes.ok) {
      console.error("Erro MP:", JSON.stringify(mpData));
      await sb.from("payments").update({
        status:        "rejected",
        raw_mp:        mpData,
        atualizado_em: new Date().toISOString(),
      }).eq("id", payment.id);

      const errMsg =
        mpData?.message ||
        mpData?.cause?.[0]?.description ||
        "Pagamento recusado. Verifique os dados do cartão.";
      return new Response(JSON.stringify({ error: errMsg }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mpStatus = mpData.status;

    await sb.from("payments").update({
      mp_payment_id: String(mpData.id),
      status:        mapMpStatus(mpStatus),
      metodo:        mpData.payment_type_id || null,
      raw_mp:        mpData,
      atualizado_em: new Date().toISOString(),
    }).eq("id", payment.id);

    // ── 7. Se aprovado: processar imediatamente ──────────────
    if (mpStatus === "approved") {
      await processApprovedPayment(
        { id: payment.id, user_id: user.id, product_id: product.id, valor: product.preco },
        product,
        user.email,
        sb,
      );
    }

    return new Response(
      JSON.stringify({
        ok:         true,
        status:     mpStatus,
        payment_id: payment.id,
        mp_id:      mpData.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err) {
    console.error("Erro inesperado:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Mapeia status MP → nosso status ────────────────────────
function mapMpStatus(mpStatus: string): string {
  const map: Record<string, string> = {
    approved: "approved", rejected: "rejected", pending: "pending",
    in_process: "pending", authorized: "pending", cancelled: "cancelled",
    refunded: "refunded", charged_back: "refunded",
  };
  return map[mpStatus] ?? mpStatus;
}

// ── Processa pagamento aprovado ─────────────────────────────
async function processApprovedPayment(
  payment: { id: string; user_id: string; product_id: string; valor: any },
  product: { id: string; titulo: string; cotas: number; genero: string; autor: string; slug: string },
  userEmail: string,
  sb: ReturnType<typeof createClient>,
) {
  const { user_id, product_id, valor } = payment;

  // a) purchase
  const { data: purchase, error: purchaseErr } = await sb
    .from("purchases")
    .insert({
      user_id,
      product_id,
      payment_id: payment.id,
      valor_pago: valor,
      cotas:      product.cotas,
      status:     "active",
    })
    .select("id")
    .single();

  if (purchaseErr) { console.error("Erro ao criar purchase:", purchaseErr); return; }

  // b) user_library
  await sb.from("user_library").upsert({
    user_id,
    product_id,
    origem:      "purchase",
    origem_id:   purchase.id,
    liberado_em: new Date().toISOString(),
    expira_em:   null,
  }, { onConflict: "user_id,product_id", ignoreDuplicates: false });

  // c) download token 72h
  const { data: dlToken } = await sb
    .from("downloads")
    .insert({
      user_id,
      product_id,
      expira_em: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    })
    .select("token")
    .single();

  // d) draw entry + números
  const { data: draw } = await sb
    .from("draws")
    .select("id, meta_tipo, meta_valor, meta_atual, max_numeros")
    .eq("status", "open")
    .order("criado_em", { ascending: false })
    .limit(1)
    .single();

  if (draw) {
    await sb.from("draw_entries").upsert({
      draw_id:     draw.id,
      user_id,
      purchase_id: purchase.id,
      cotas_base:  product.cotas,
      cotas_bonus: 0,
      qualificado: false,
    }, { onConflict: "draw_id,purchase_id", ignoreDuplicates: true });

    await distribuirNumeros(
      draw.id, user_id, purchase.id,
      product.cotas, draw.max_numeros || 100000, sb,
    );

    const incremento = draw.meta_tipo === "quantidade" ? 1 : Number(valor);
    await sb.from("draws")
      .update({ meta_atual: (Number(draw.meta_atual) || 0) + incremento })
      .eq("id", draw.id);
  }

  // e) e-mail
  if (userEmail) {
    await sendPurchaseEmail(userEmail, product, dlToken?.token, valor);
  }

  console.log(`[process-payment] Pagamento ${payment.id} processado para ${user_id}`);
}

// ── Distribui números na cartela ───────────────────────────
async function distribuirNumeros(
  drawId: string, userId: string, purchaseId: string,
  quantidade: number, maxNumeros: number,
  sb: ReturnType<typeof createClient>,
): Promise<void> {
  const { data: existentes } = await sb
    .from("draw_numbers").select("numero").eq("draw_id", drawId);
  const ocupados = new Set((existentes || []).map((n: any) => n.numero));

  const novos: number[] = [];
  let tentativas = 0;
  while (novos.length < quantidade && tentativas < quantidade * 100) {
    tentativas++;
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const n = (buf[0] % maxNumeros) + 1;
    if (!ocupados.has(n) && !novos.includes(n)) { novos.push(n); ocupados.add(n); }
  }

  if (novos.length === 0) {
    console.warn(`[CARTELA] Sem números disponíveis para ${userId}`);
    return;
  }

  const rows = novos.map(n => ({
    draw_id: drawId, numero: n, user_id: userId,
    origem: "purchase", purchase_id: purchaseId,
  }));

  const { error } = await sb.from("draw_numbers").insert(rows);
  if (error) console.error("[CARTELA] Erro ao inserir números:", error);
  else console.log(`[CARTELA] ${novos.length} números para ${userId}: ${novos.join(", ")}`);
}

// ── Envia e-mail via Resend ─────────────────────────────────
async function sendPurchaseEmail(
  email: string, product: any, _downloadToken?: string, valor?: any,
) {
  if (!RESEND_API_KEY) return;

  const valorFmt = valor ? "R$" + Number(valor).toFixed(2).replace(".", ",") : "";
  const generoEmoji: Record<string, string> = {
    "Ensaio": "⚖️", "Ficção Literária": "🔍", "Ficção Documental": "🌐",
    "Manual": "📘", "Finanças · Método": "⚡",
  };
  const emoji = generoEmoji[product.genero] ?? "📖";
  const ano   = new Date().getFullYear();
  const areaUrl = `${SITE_URL}/area-cliente.html`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Compra confirmada</title></head>
<body style="margin:0;padding:0;background:#f0ebe0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0ebe0;padding:40px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#fdfbf7;border:1px solid rgba(26,74,46,.12)">
  <tr><td style="height:4px;background:linear-gradient(90deg,#1a4a2e,#c8a84b)"></td></tr>
  <tr><td style="padding:32px 48px 24px;border-bottom:1px solid rgba(26,74,46,.08)">
    <p style="margin:0;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#1a4a2e">✦ &nbsp; Editora Três Trevo</p>
  </td></tr>
  <tr><td style="padding:36px 48px 0">
    <h1 style="margin:0 0 12px;font-size:30px;font-weight:300;color:#0f2d1a">Sua compra foi <em style="color:#1a4a2e;font-style:italic">confirmada</em></h1>
    <p style="margin:0;font-size:14px;color:#555;line-height:1.7">O pagamento foi aprovado. Seu ebook já está disponível na sua biblioteca.</p>
  </td></tr>
  <tr><td style="padding:28px 48px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;border:1px solid rgba(26,74,46,.1);border-left:3px solid #c8a84b">
      <tr><td style="padding:20px 24px">
        <p style="margin:0 0 4px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a6f28">${product.genero}</p>
        <h2 style="margin:0 0 4px;font-size:20px;font-weight:600;color:#0f2d1a">${emoji} ${product.titulo}</h2>
        <p style="margin:0 0 16px;font-size:13px;color:#777">${product.autor}</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:13px;color:#555">Valor pago</td>
            <td align="right" style="font-size:18px;font-weight:700;color:#1a4a2e">${valorFmt}</td>
          </tr>
          <tr><td colspan="2" style="padding-top:8px">
            <div style="background:#1a4a2e;color:#c8a84b;font-size:13px;padding:10px 14px">
              ✦ &nbsp;<strong>${product.cotas} cota${product.cotas !== 1 ? "s" : ""}</strong> no Programa Cultural Três Trevo
            </div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 48px 32px">
    <a href="${areaUrl}" style="display:block;width:100%;padding:16px;background:#1a4a2e;color:#f0ebe0;font-size:14px;font-weight:500;text-decoration:none;text-align:center;box-sizing:border-box">Acessar minha biblioteca →</a>
  </td></tr>
  <tr><td style="padding:0 48px 28px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f0e8;border:1px solid rgba(26,74,46,.1);padding:20px 24px">
      <tr><td>
        <p style="margin:0 0 10px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a6f28">✦ Programa Cultural</p>
        <p style="margin:0 0 10px;font-size:14px;color:#333;font-weight:500">Como participar do sorteio</p>
        <table cellpadding="0" cellspacing="0" border="0">
          <tr><td style="padding-right:10px;padding-bottom:8px;vertical-align:top"><span style="display:inline-block;width:20px;height:20px;background:#1a4a2e;color:#c8a84b;text-align:center;line-height:20px;font-size:11px;font-weight:700">1</span></td>
            <td style="font-size:13px;color:#555;line-height:1.6;padding-bottom:8px">Após 7 dias, acesse sua biblioteca e clique em <strong>Sorteios</strong></td></tr>
          <tr><td style="padding-right:10px;padding-bottom:8px;vertical-align:top"><span style="display:inline-block;width:20px;height:20px;background:#1a4a2e;color:#c8a84b;text-align:center;line-height:20px;font-size:11px;font-weight:700">2</span></td>
            <td style="font-size:13px;color:#555;line-height:1.6;padding-bottom:8px">Escreva um depoimento sobre o livro (mín. 20 palavras)</td></tr>
          <tr><td style="padding-right:10px;vertical-align:top"><span style="display:inline-block;width:20px;height:20px;background:#c8a84b;color:#0f2d1a;text-align:center;line-height:20px;font-size:11px;font-weight:700">3</span></td>
            <td style="font-size:13px;color:#555;line-height:1.6">Suas cotas são liberadas — acompanhe pelo extrato em Minha Biblioteca</td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:0 48px 28px">
    <p style="margin:0;font-size:12px;color:#666;line-height:1.7;padding:14px 16px;background:#f0f7f2;border:1px solid rgba(26,74,46,.15)">
      <strong style="color:#1a4a2e">Garantia de 7 dias (CDC art. 49)</strong><br>
      Se não ficar satisfeito, devolvemos 100% do valor. Escreva para <a href="mailto:sac@3trevo.com.br" style="color:#1a4a2e">sac@3trevo.com.br</a>
    </p>
  </td></tr>
  <tr><td style="padding:20px 48px 28px;border-top:1px solid rgba(26,74,46,.08)">
    <p style="margin:0;font-size:11px;color:#999;line-height:1.6">
      <a href="${SITE_URL}" style="color:#1a4a2e;text-decoration:none">3trevo.com.br</a> &nbsp;·&nbsp;
      <a href="mailto:sac@3trevo.com.br" style="color:#1a4a2e;text-decoration:none">sac@3trevo.com.br</a> &nbsp;·&nbsp; © ${ano} Editora Três Trevo
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      from:    `Editora Três Trevo <${FROM_EMAIL}>`,
      to:      [email],
      subject: `✦ Seu ebook está pronto — ${product.titulo}`,
      html,
    }),
  }).catch(e => console.error("[EMAIL] Erro:", e));
}
