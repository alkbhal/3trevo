// supabase/functions/create-preference/index.ts
// Edge Function: cria preferência de pagamento no MercadoPago
// POST { product_id: string, user_email: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL        = Deno.env.get("SITE_URL") ?? "https://3trevo.com.br";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ── 1. Autenticar o usuário via JWT do Supabase ──────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sbUser = createClient(SUPABASE_URL, SERVICE_KEY);
    const token  = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sbUser.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Ler body ──────────────────────────────────────────
    const { product_id, user_email } = await req.json();
    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Buscar produto ────────────────────────────────────
    const { data: product, error: prodError } = await sbUser
      .from("products")
      .select("id, titulo, preco, cotas")
      .eq("id", product_id)
      .eq("ativo", true)
      .single();

    if (prodError || !product) {
      return new Response(JSON.stringify({ error: "Produto não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Criar registro de payment (pending) ───────────────
    const { data: payment, error: payError } = await sbUser
      .from("payments")
      .insert({
        user_id:      user.id,
        product_id:   product.id,
        status:       "pending",
        valor:        product.preco,
        email_pagador: user_email || user.email,
      })
      .select("id")
      .single();

    if (payError || !payment) {
      console.error("Erro ao criar payment:", payError);
      return new Response(JSON.stringify({ error: "Erro interno ao criar pagamento" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Criar preferência no MercadoPago ──────────────────
    const prefPayload = {
      items: [{
        id:          product.id,
        title:       product.titulo,
        unit_price:  Number(product.preco),
        quantity:    1,
        currency_id: "BRL",
      }],
      payer: {
        email: user_email || user.email,
      },
      back_urls: {
        success: `${SITE_URL}/area-cliente.html?status=success`,
        failure: `${SITE_URL}/checkout.html?status=failure`,
        pending: `${SITE_URL}/area-cliente.html?status=pending`,
      },
      auto_return:       "approved",
      external_reference: payment.id,     // nosso payment_uuid
      notification_url:  `${SUPABASE_URL}/functions/v1/mp-webhook`,
      statement_descriptor: "TRES TREVO",
      payment_methods: {
        excluded_payment_types: [{ id: "ticket" }], // sem boleto: compensação bancária impede entrega imediata
        installments: 1,
      },
    };

    const mpRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(prefPayload),
    });

    if (!mpRes.ok) {
      const mpErr = await mpRes.text();
      console.error("Erro MP:", mpErr);
      return new Response(JSON.stringify({ error: "Erro ao criar preferência MP" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const mpData = await mpRes.json();

    // ── 6. Salvar preference_id no payment ───────────────────
    await sbUser
      .from("payments")
      .update({ mp_preference_id: mpData.id })
      .eq("id", payment.id);

    // ── 7. Retornar init_point para redirecionar o usuário ────
    return new Response(
      JSON.stringify({
        preference_id: mpData.id,
        init_point:    mpData.init_point,     // produção
        sandbox_init_point: mpData.sandbox_init_point, // testes
        payment_id:    payment.id,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Erro inesperado:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
