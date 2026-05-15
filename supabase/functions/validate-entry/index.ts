// supabase/functions/validate-entry/index.ts
// Edge Function: valida participação no Programa Cultural
// POST { draw_id, purchase_id, depoimento, redes_seguidas: string[] }
// Requer usuário autenticado

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pesos das redes sociais no multiplicador de cotas
const PESOS: Record<string, number> = {
  whatsapp:  25,
  instagram: 25,
  facebook:  20,
  tiktok:    15,
  youtube:   15,
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

    // ── 2. Ler body ──────────────────────────────────────────
    const { draw_id, purchase_id, depoimento, redes_seguidas } = await req.json();

    if (!draw_id || !purchase_id) {
      return new Response(JSON.stringify({ error: "draw_id e purchase_id são obrigatórios" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Verificar que a compra pertence ao usuário ────────
    const { data: purchase, error: purErr } = await sb
      .from("purchases")
      .select("id, user_id, product_id, cotas, criado_em, status")
      .eq("id", purchase_id)
      .eq("user_id", user.id)
      .single();

    if (purErr || !purchase) {
      return new Response(JSON.stringify({ error: "Compra não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (purchase.status !== "active") {
      return new Response(JSON.stringify({ error: "Compra cancelada ou reembolsada — participação não permitida" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Verificar regra dos 7 dias (CDC art. 49) ──────────
    const compraEm  = new Date(purchase.criado_em);
    const diasDesde = (Date.now() - compraEm.getTime()) / (1000 * 60 * 60 * 24);

    if (diasDesde < 7) {
      const diasRestantes = Math.ceil(7 - diasDesde);
      return new Response(JSON.stringify({
        error:          `Aguarde ${diasRestantes} dia(s) para participar (período de leitura obrigatório de 7 dias).`,
        dias_restantes: diasRestantes,
      }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Validar depoimento ────────────────────────────────
    const textoLimpo = (depoimento || "").trim();
    const palavras   = textoLimpo.split(/\s+/).filter(Boolean);

    if (palavras.length < 20) {
      return new Response(JSON.stringify({
        error:      `Depoimento muito curto. Mínimo 20 palavras (você escreveu ${palavras.length}).`,
        palavras:   palavras.length,
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 6. Calcular multiplicador com base nas redes ─────────
    const redes: string[] = Array.isArray(redes_seguidas) ? redes_seguidas : [];
    let pctTotal = 0;
    for (const rede of redes) {
      pctTotal += PESOS[rede.toLowerCase()] ?? 0;
    }
    // Fórmula: 1× base + até 2× extra (pctTotal 0-100 → +0 a +2)
    const multiplicador = Math.min(1 + (pctTotal / 50), 3);
    const cotasBonus    = Math.round(purchase.cotas * (multiplicador - 1));
    const cotasTotal    = purchase.cotas + cotasBonus;

    // ── 7. Verificar se o sorteio existe e está aberto ───────
    const { data: draw } = await sb
      .from("draws")
      .select("id, status, meta_tipo, meta_valor, meta_atual")
      .eq("id", draw_id)
      .single();

    if (!draw || !["open", "aguardando_qualificacao"].includes(draw.status || "")) {
      return new Response(JSON.stringify({ error: "Sorteio não disponível para participação" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 8. Upsert da draw_entry ──────────────────────────────
    const { data: entry, error: entryErr } = await sb
      .from("draw_entries")
      .upsert({
        draw_id,
        user_id:        user.id,
        purchase_id,
        cotas_base:     purchase.cotas,
        cotas_bonus:    cotasBonus,
        dep_validado:   true,
        dep_texto:      textoLimpo,
        redes_seguidas: redes,
        multiplicador:  Number(multiplicador.toFixed(1)),
        qualificado:    true,
      }, { onConflict: "draw_id,purchase_id" })
      .select("id, cotas_base, cotas_bonus, multiplicador, qualificado")
      .single();

    if (entryErr) {
      console.error("Erro ao upsert draw_entry:", entryErr);
      return new Response(JSON.stringify({ error: "Erro ao registrar participação" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 9. Verificar se deve disparar sorteio automático ─────
    // Só relevante quando status = 'aguardando_qualificacao'
    // (meta já atingida, aguardando todos qualificarem)
    if (draw.status === "aguardando_qualificacao") {
      const { data: pendentes } = await sb
        .from("draw_entries")
        .select("id")
        .eq("draw_id", draw_id)
        .eq("qualificado", false)
        .limit(1);

      if (!pendentes || pendentes.length === 0) {
        console.log(`[VALIDATE] Último qualificado — disparando sorteio automático para ${draw_id}`);
        const supaUrl    = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

        // Fire-and-forget
        fetch(`${supaUrl}/functions/v1/execute-draw`, {
          method:  "POST",
          headers: {
            "Content-Type":   "application/json",
            "Authorization":  `Bearer ${serviceKey}`,
            "X-Internal-Key": serviceKey,
          },
          body: JSON.stringify({ draw_id }),
        }).catch(e => console.error("[VALIDATE] Erro ao chamar execute-draw:", e));
      }
    }

    return new Response(
      JSON.stringify({
        success:      true,
        qualificado:  true,
        cotas_base:   purchase.cotas,
        cotas_bonus:  cotasBonus,
        cotas_total:  cotasTotal,
        multiplicador: Number(multiplicador.toFixed(1)),
        entry_id:     entry?.id,
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
