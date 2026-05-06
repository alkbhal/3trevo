// supabase/functions/assign-numbers/index.ts
// Edge Function: atribuição manual de números da cartela (Admin only)
//
// POST { draw_id, user_email, quantidade?, numeros_especificos?: number[] }
// Requer header Authorization: Bearer <admin_token>
// Retorna: { success, numeros_atribuidos, total }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL  = Deno.env.get("ADMIN_EMAIL") || "al_kbhal@yahoo.com.br";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const err = (msg: string, status = 400) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    // ── 1. Autenticar admin ──────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return err("Não autorizado", 401);

    const sb    = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sb.auth.getUser(token);

    if (authError || !user) return err("Token inválido", 401);
    if (user.email !== ADMIN_EMAIL) return err("Acesso restrito ao administrador", 403);

    // ── 2. Ler body ──────────────────────────────────────────
    const body = await req.json();
    const { draw_id, user_email, quantidade, numeros_especificos } = body;

    if (!draw_id)    return err("draw_id é obrigatório");
    if (!user_email) return err("user_email é obrigatório");

    // ── 3. Verificar sorteio ─────────────────────────────────
    const { data: draw, error: drawErr } = await sb
      .from("draws")
      .select("id, status, max_numeros")
      .eq("id", draw_id)
      .single();

    if (drawErr || !draw) return err("Sorteio não encontrado", 404);
    if (draw.status === "drawn") return err("Sorteio já encerrado — não é possível atribuir números");

    const maxNumeros = draw.max_numeros || 100000;

    // ── 4. Resolver user_id pelo email ───────────────────────
    // Usa auth.admin para lookup pelo email exato
    const { data: usersPage } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const targetUser = (usersPage?.users || []).find(
      (u) => u.email?.toLowerCase() === user_email.toLowerCase().trim()
    );

    if (!targetUser) return err(`Usuário não encontrado: ${user_email}`, 404);
    const userId = targetUser.id;

    // ── 5. Buscar números já atribuídos nesta rodada ─────────
    const { data: existentes } = await sb
      .from("draw_numbers")
      .select("numero")
      .eq("draw_id", draw_id);

    const ocupados = new Set((existentes || []).map((n: any) => n.numero as number));

    let numerosParaAtribuir: number[] = [];

    if (numeros_especificos && Array.isArray(numeros_especificos) && numeros_especificos.length > 0) {
      // ── Atribuir números específicos informados ──────────
      const validos = (numeros_especificos as number[]).filter(
        (n) => Number.isInteger(n) && n >= 1 && n <= maxNumeros
      );

      if (validos.length === 0) {
        return err("Nenhum número válido nos numeros_especificos (devem ser inteiros entre 1 e " + maxNumeros + ")");
      }

      const jaAtribuidos = validos.filter((n) => ocupados.has(n));
      if (jaAtribuidos.length > 0) {
        return err(`Número(s) já atribuído(s) nesta rodada: ${jaAtribuidos.join(", ")}`);
      }

      numerosParaAtribuir = validos;

    } else {
      // ── Sortear N números aleatórios disponíveis ─────────
      const qtd = Math.max(1, Math.min(Number(quantidade) || 1, 1000));

      const novos: number[] = [];
      let tentativas = 0;

      while (novos.length < qtd && tentativas < qtd * 200) {
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
        return err("Cartela cheia ou sem números disponíveis nesta rodada");
      }

      if (novos.length < qtd) {
        console.warn(`[ASSIGN] Cartela quase cheia: pedido ${qtd}, distribuído ${novos.length}`);
      }

      numerosParaAtribuir = novos;
    }

    // ── 6. Inserir em draw_numbers ───────────────────────────
    const rows = numerosParaAtribuir.map((n) => ({
      draw_id,
      numero:   n,
      user_id:  userId,
      origem:   "manual" as const,
    }));

    const { error: insertErr } = await sb.from("draw_numbers").insert(rows);

    if (insertErr) {
      console.error("[ASSIGN] Erro ao inserir números:", insertErr);
      // Verificar se é erro de unicidade
      if (insertErr.code === "23505") {
        return err("Um ou mais números já estão atribuídos a outro usuário nesta rodada", 409);
      }
      return err("Erro ao atribuir números: " + insertErr.message, 500);
    }

    console.log(`[ASSIGN] Admin ${user.email} atribuiu ${numerosParaAtribuir.length} números para ${user_email} na rodada ${draw_id}: ${numerosParaAtribuir.join(", ")}`);

    return new Response(
      JSON.stringify({
        success:             true,
        draw_id,
        user_email,
        user_id:             userId,
        numeros_atribuidos:  numerosParaAtribuir,
        total:               numerosParaAtribuir.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Erro inesperado:", err);
    return new Response(JSON.stringify({ error: "Erro interno: " + String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
