// supabase/functions/mp-webhook/index.ts
// Edge Function: recebe notificações IPN do MercadoPago
// Endpoint configurado como notification_url na preferência

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY");
const SITE_URL        = Deno.env.get("SITE_URL") ?? "https://3trevo.com.br";
const FROM_EMAIL      = Deno.env.get("FROM_EMAIL") ?? "sac@3trevo.com.br";

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

serve(async (req: Request) => {
  // MercadoPago envia GET com query params para validação inicial
  if (req.method === "GET") {
    return new Response("ok", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    console.log("Webhook recebido:", JSON.stringify(body));

    // IPN format: { type: "payment", data: { id: "..." } }
    // Notifications format: { action: "payment.updated", data: { id: "..." } }
    const paymentMpId =
      body?.data?.id ||
      body?.id ||
      null;

    const topic = body?.type || body?.topic || "";

    // Apenas processar notificações de pagamento
    if (!paymentMpId || !["payment", "merchant_order"].includes(topic)) {
      return new Response("ignored", { status: 200 });
    }

    // ── 1. Consultar dados do pagamento na API do MP ─────────
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentMpId}`, {
      headers: { "Authorization": `Bearer ${MP_ACCESS_TOKEN}` },
    });

    if (!mpRes.ok) {
      console.error("Erro ao consultar pagamento MP:", await mpRes.text());
      return new Response("mp_error", { status: 200 }); // 200 para MP não retentar
    }

    const mpPayment = await mpRes.json();
    const externalRef = mpPayment.external_reference; // nosso payment.id

    if (!externalRef) {
      console.warn("external_reference ausente no pagamento MP");
      return new Response("no_ref", { status: 200 });
    }

    // ── 2. Buscar nosso payment ──────────────────────────────
    const { data: payment, error: payFetchErr } = await sb
      .from("payments")
      .select("id, user_id, product_id, status, valor")
      .eq("id", externalRef)
      .single();

    if (payFetchErr || !payment) {
      console.warn("Payment não encontrado:", externalRef);
      return new Response("not_found", { status: 200 });
    }

    // ── 3. Atualizar status do payment ───────────────────────
    const mpStatus   = mpPayment.status;          // approved | rejected | pending | etc.
    const mpMethod   = mpPayment.payment_type_id; // credit_card | debit_card | pix | ticket
    const mpVencimento = mpPayment.date_of_expiration
      ? new Date(mpPayment.date_of_expiration).toISOString()
      : null;

    await sb.from("payments").update({
      mp_payment_id: String(paymentMpId),
      status:        mapMpStatus(mpStatus),
      metodo:        mpMethod || null,
      vencimento:    mpVencimento,
      raw_mp:        mpPayment,
      atualizado_em: new Date().toISOString(),
    }).eq("id", payment.id);

    // ── 4. Se aprovado e ainda não processado → liberar conteúdo
    if (mpStatus === "approved" && payment.status !== "approved") {
      await processApprovedPayment(payment, mpPayment);
    }

    return new Response("ok", { status: 200 });

  } catch (err) {
    console.error("Erro no webhook:", err);
    // Sempre retornar 200 para o MP não retentar indefinidamente
    return new Response("error", { status: 200 });
  }
});

// ── Processa pagamento aprovado ─────────────────────────────
async function processApprovedPayment(payment: any, mpPayment: any) {
  const { user_id, product_id, valor } = payment;

  // Buscar produto para saber as cotas e título
  const { data: product } = await sb
    .from("products")
    .select("id, titulo, cotas, genero, autor, slug")
    .eq("id", product_id)
    .single();

  if (!product) {
    console.error("Produto não encontrado para liberação:", product_id);
    return;
  }

  // ── a) Criar purchase ────────────────────────────────────
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

  if (purchaseErr) {
    console.error("Erro ao criar purchase:", purchaseErr);
    return;
  }

  // ── b) Criar user_library (acesso ao conteúdo) ───────────
  const { error: libErr } = await sb
    .from("user_library")
    .upsert({
      user_id,
      product_id,
      origem:     "purchase",
      origem_id:  purchase.id,
      liberado_em: new Date().toISOString(),
      expira_em:  null,   // acesso permanente
    }, { onConflict: "user_id,product_id", ignoreDuplicates: false });

  if (libErr) {
    console.error("Erro ao criar user_library:", libErr);
  }

  // ── c) Gerar token de download (72h) ─────────────────────
  const { data: dlToken, error: dlErr } = await sb
    .from("downloads")
    .insert({
      user_id,
      product_id,
      expira_em: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      ip: null,
    })
    .select("token")
    .single();

  if (dlErr) {
    console.error("Erro ao criar download token:", dlErr);
  }

  // ── d) Registrar draw_entry + distribuir números na cartela ─
  const { data: draw } = await sb
    .from("draws")
    .select("id, meta_tipo, meta_valor, meta_atual, max_numeros")
    .eq("status", "open")
    .order("criado_em", { ascending: false })
    .limit(1)
    .single();

  if (draw) {
    // draw_entry (cotas/depoimento)
    const { error: entryErr } = await sb
      .from("draw_entries")
      .upsert({
        draw_id:     draw.id,
        user_id,
        purchase_id: purchase.id,
        cotas_base:  product.cotas,
        cotas_bonus: 0,
        qualificado: false,
      }, { onConflict: "draw_id,purchase_id", ignoreDuplicates: true });

    if (entryErr) console.error("Erro ao criar draw_entry:", entryErr);

    // ── Distribuir números na cartela ────────────────────────
    await distribuirNumeros(draw.id, user_id, purchase.id, product.cotas, draw.max_numeros || 100000);

    // ── Atualizar meta_atual ─────────────────────────────────
    const incremento = draw.meta_tipo === "quantidade" ? 1 : Number(valor);
    const { data: updatedDraw } = await sb
      .from("draws")
      .update({ meta_atual: (Number(draw.meta_atual) || 0) + incremento })
      .eq("id", draw.id)
      .select("meta_atual, meta_valor, status")
      .single();

    // ── Verificar se meta foi atingida ───────────────────────
    if (updatedDraw && Number(updatedDraw.meta_atual) >= Number(updatedDraw.meta_valor)
        && updatedDraw.status === "open") {
      await verificarEDisparar(draw.id, sb);
    }
  }

  // ── e) Buscar e-mail do usuário e enviar notificação ─────
  const { data: userData } = await sb.auth.admin.getUserById(user_id);
  const userEmail = userData?.user?.email;

  if (userEmail) {
    await sendPurchaseEmail(userEmail, product, dlToken?.token, valor);
  }

  console.log(`Pagamento ${payment.id} processado com sucesso para usuário ${user_id}`);
}

// ── Distribui números aleatórios na cartela para o usuário ─
// Usa crypto.getRandomValues para números aleatórios de qualidade
// em produção; evita colisões com números já atribuídos.
async function distribuirNumeros(
  drawId: string,
  userId: string,
  purchaseId: string,
  quantidade: number,
  maxNumeros: number,
): Promise<void> {
  // Busca números já atribuídos nesta rodada (para evitar conflito)
  const { data: existentes } = await sb
    .from("draw_numbers")
    .select("numero")
    .eq("draw_id", drawId);

  const ocupados = new Set((existentes || []).map(n => n.numero));

  // Gerar `quantidade` números únicos aleatórios
  const novos: number[] = [];
  let tentativas = 0;
  while (novos.length < quantidade && tentativas < quantidade * 100) {
    tentativas++;
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const n = (buf[0] % maxNumeros) + 1;
    if (!ocupados.has(n) && !novos.includes(n)) {
      novos.push(n);
      ocupados.add(n);
    }
  }

  if (novos.length === 0) {
    console.warn(`[CARTELA] Não foi possível distribuir números para ${userId} — cartela cheia?`);
    return;
  }

  const rows = novos.map(n => ({
    draw_id:     drawId,
    numero:      n,
    user_id:     userId,
    origem:      "purchase",
    purchase_id: purchaseId,
  }));

  const { error } = await sb.from("draw_numbers").insert(rows);
  if (error) console.error("[CARTELA] Erro ao inserir números:", error);
  else console.log(`[CARTELA] Distribuídos ${novos.length} números para ${userId}: ${novos.join(", ")}`);
}

// ── Verifica se todos qualificados e dispara sorteio auto ───
// Chamado após meta atingida. Se ainda houver participantes
// dentro do prazo de 7 dias, marca 'aguardando_qualificacao'.
async function verificarEDisparar(drawId: string, sbClient: ReturnType<typeof createClient>): Promise<void> {
  // Verificar se há participantes ainda dentro do prazo de 7 dias
  const { data: entries } = await sbClient
    .from("draw_entries")
    .select("qualificado, criado_em")
    .eq("draw_id", drawId);

  const naoQualificados = (entries || []).filter(e => !e.qualificado);
  const alguemNoPrazo   = naoQualificados.some(e => {
    const dias = (Date.now() - new Date(e.criado_em).getTime()) / 86400000;
    return dias < 7;
  });

  if (alguemNoPrazo) {
    // Aguardar — quando o último se qualificar, validate-entry vai disparar
    await sbClient.from("draws").update({ status: "aguardando_qualificacao" }).eq("id", drawId);
    console.log(`[DRAW] Rodada ${drawId} marcada como aguardando_qualificacao`);
    return;
  }

  // Todos qualificados ou prazo vencido — disparar sorteio automático
  console.log(`[DRAW] Meta atingida + todos prontos — disparando sorteio automático para ${drawId}`);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  await fetch(`${supabaseUrl}/functions/v1/execute-draw`, {
    method:  "POST",
    headers: {
      "Content-Type":    "application/json",
      "Authorization":   `Bearer ${serviceKey}`,
      "X-Internal-Key":  serviceKey,
    },
    body: JSON.stringify({ draw_id: drawId }),
  }).catch(e => console.error("[DRAW] Erro ao chamar execute-draw:", e));
}

// ── Mapeia status do MP para nosso status ──────────────────
function mapMpStatus(mpStatus: string): string {
  const map: Record<string, string> = {
    approved:       "approved",
    rejected:       "rejected",
    pending:        "pending",
    in_process:     "pending",
    authorized:     "pending",
    cancelled:      "cancelled",
    refunded:       "refunded",
    charged_back:   "refunded",
  };
  return map[mpStatus] ?? mpStatus;
}

// ── Envia e-mail de confirmação de compra via Resend ───────
async function sendPurchaseEmail(
  email: string,
  product: any,
  downloadToken?: string,
  valor?: any,
) {
  if (!RESEND_API_KEY) {
    console.warn("[EMAIL] RESEND_API_KEY não configurado — pulando envio de e-mail.");
    return;
  }

  const areaClienteUrl = `${SITE_URL}/area-cliente.html`;
  const valorFmt = valor
    ? "R$" + Number(valor).toFixed(2).replace(".", ",")
    : "";

  // Mapeamento de emoji por gênero
  const generoEmoji: Record<string, string> = {
    "Ensaio":            "⚖️",
    "Ficção Literária":  "🔍",
    "Ficção Documental": "🌐",
    "Manual":            "📘",
  };
  const emoji = generoEmoji[product.genero] ?? "📖";

  const html = buildEmailHtml({
    titulo:   product.titulo,
    autor:    product.autor,
    genero:   product.genero,
    emoji,
    cotas:    product.cotas,
    valor:    valorFmt,
    areaUrl:  areaClienteUrl,
    siteUrl:  SITE_URL,
  });

  try {
    const res = await fetch("https://api.resend.com/emails", {
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
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[EMAIL] Erro Resend:", errText);
    } else {
      const resData = await res.json();
      console.log(`[EMAIL] Enviado com sucesso para ${email}. ID: ${resData.id}`);
    }
  } catch (err) {
    console.error("[EMAIL] Exceção ao enviar:", err);
  }
}

// ── Template HTML do e-mail de confirmação de compra ──────
function buildEmailHtml(data: {
  titulo:  string;
  autor:   string;
  genero:  string;
  emoji:   string;
  cotas:   number;
  valor:   string;
  areaUrl: string;
  siteUrl: string;
}): string {
  const { titulo, autor, genero, emoji, cotas, valor, areaUrl, siteUrl } = data;
  const ano = new Date().getFullYear();

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Compra confirmada — Editora Três Trevo</title></head>
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
        <p style="margin:0 0 4px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a6f28">${genero}</p>
        <h2 style="margin:0 0 4px;font-size:20px;font-weight:600;color:#0f2d1a">${emoji} ${titulo}</h2>
        <p style="margin:0 0 16px;font-size:13px;color:#777">${autor}</p>
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-size:13px;color:#555">Valor pago</td>
            <td align="right" style="font-size:18px;font-weight:700;color:#1a4a2e">${valor}</td>
          </tr>
          <tr><td colspan="2" style="padding-top:8px">
            <div style="background:#1a4a2e;color:#c8a84b;font-size:13px;padding:10px 14px">
              ✦ &nbsp;<strong>${cotas} cota${cotas !== 1 ? "s" : ""}</strong> no Programa Cultural Três Trevo
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
      <a href="${siteUrl}" style="color:#1a4a2e;text-decoration:none">3trevo.com.br</a> &nbsp;·&nbsp;
      <a href="mailto:sac@3trevo.com.br" style="color:#1a4a2e;text-decoration:none">sac@3trevo.com.br</a> &nbsp;·&nbsp; © ${ano} Editora Três Trevo
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>`;
}
