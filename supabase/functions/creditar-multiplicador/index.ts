// supabase/functions/creditar-multiplicador/index.ts
// Fase 2 — questionário voluntário → multiplicador de cotas (LGPD-compliant)
//
// POST { purchaseId, categoria, respostas, consentimento }
// Requer header Authorization: Bearer <user_jwt>
// Retorna: { ok: true } ou { ok: false, erro: string }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY       = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function calcMultiplicador(respostas: Record<string, unknown>): number {
  // 1.0 base + 0.5 por resposta fornecida, cap 3.0
  const n = Object.keys(respostas).filter(k => respostas[k] !== null && respostas[k] !== "").length;
  return Math.min(3.0, 1.0 + n * 0.5);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── 1. Validar JWT do usuário ────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, erro: "nao_autenticado" }, 401);

    const userToken = authHeader.replace("Bearer ", "");
    const sbUser    = createClient(SUPABASE_URL, ANON_KEY);
    const { data: { user }, error: authErr } = await sbUser.auth.getUser(userToken);
    if (authErr || !user) return json({ ok: false, erro: "token_invalido" }, 401);

    // ── 2. Ler e validar body ─────────────────────────────────
    const body = await req.json();
    const { purchaseId, categoria, respostas, consentimento } = body;

    if (!consentimento)           return json({ ok: false, erro: "sem_consentimento" });
    if (!purchaseId)              return json({ ok: false, erro: "purchaseId_obrigatorio" });
    if (!categoria)               return json({ ok: false, erro: "categoria_obrigatoria" });
    if (!respostas || typeof respostas !== "object") return json({ ok: false, erro: "respostas_invalidas" });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── 3. Verificar que a compra pertence ao usuário ────────
    const { data: purchase, error: purchaseErr } = await sb
      .from("purchases")
      .select("id, user_id")
      .eq("id", purchaseId)
      .single();

    if (purchaseErr || !purchase)     return json({ ok: false, erro: "compra_nao_encontrada" }, 404);
    if (purchase.user_id !== user.id) return json({ ok: false, erro: "acesso_negado" }, 403);

    // ── 4. Verificar se já respondeu ────────────────────────
    const { data: entry } = await sb
      .from("draw_entries")
      .select("id, pesquisa_respondida")
      .eq("purchase_id", purchaseId)
      .single();

    if (entry?.pesquisa_respondida) return json({ ok: false, erro: "ja_respondida" });

    // ── 5. Gravar resposta ANÔNIMA — sem purchaseId, sem user_id (LGPD) ──
    const { error: insertErr } = await sb.from("respostas_pesquisa").insert({
      categoria_premio:  categoria,
      respostas,
      consentimento_lgpd: true,
    });

    if (insertErr) {
      console.error("[MULTIPLICADOR] Erro ao gravar resposta:", insertErr);
      return json({ ok: false, erro: "erro_gravacao" }, 500);
    }

    // ── 6. Creditar multiplicador em draw_entries ─────────────
    const multiplicador = calcMultiplicador(respostas);

    const { error: updateErr } = await sb
      .from("draw_entries")
      .update({ pesquisa_respondida: true, multiplicador })
      .eq("purchase_id", purchaseId);

    if (updateErr) {
      console.error("[MULTIPLICADOR] Erro ao atualizar draw_entries:", updateErr);
      return json({ ok: false, erro: "erro_atualizacao" }, 500);
    }

    console.log(`[MULTIPLICADOR] purchase ${purchaseId} → multiplicador ${multiplicador}`);
    return json({ ok: true, multiplicador });

  } catch (e) {
    console.error("[MULTIPLICADOR] Erro inesperado:", e);
    return json({ ok: false, erro: "erro_interno" }, 500);
  }
});
