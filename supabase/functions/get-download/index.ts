// supabase/functions/get-download/index.ts
// Edge Function: gera ou renova link de download seguro para um produto
// POST { product_id: string }
// Requer usuário autenticado (JWT no header Authorization)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
    const token   = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await sbAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Ler body ──────────────────────────────────────────
    const { product_id } = await req.json();
    if (!product_id) {
      return new Response(JSON.stringify({ error: "product_id obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Verificar acesso na user_library ──────────────────
    const { data: access, error: accessError } = await sbAdmin
      .from("user_library")
      .select("id, expira_em")
      .eq("user_id", user.id)
      .eq("product_id", product_id)
      .single();

    if (accessError || !access) {
      return new Response(JSON.stringify({ error: "Acesso não encontrado. Adquira o produto para fazer download." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar se acesso expirou
    if (access.expira_em && new Date(access.expira_em) < new Date()) {
      return new Response(JSON.stringify({ error: "Acesso ao conteúdo expirado." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Buscar arquivo no produto ─────────────────────────
    const { data: product } = await sbAdmin
      .from("products")
      .select("id, titulo, arquivo_url")
      .eq("id", product_id)
      .single();

    if (!product?.arquivo_url) {
      return new Response(JSON.stringify({ error: "Arquivo não disponível ainda. Entre em contato: sac@3trevo.com.br" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Upsert token de download (renova se expirado) ─────
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;

    // Deletar tokens expirados do usuário para este produto
    await sbAdmin
      .from("downloads")
      .delete()
      .eq("user_id", user.id)
      .eq("product_id", product_id)
      .lt("expira_em", new Date().toISOString());

    // Criar novo token
    const { data: dl, error: dlError } = await sbAdmin
      .from("downloads")
      .insert({
        user_id:    user.id,
        product_id: product.id,
        expira_em:  expiresAt,
        ip,
      })
      .select("token")
      .single();

    if (dlError || !dl) {
      console.error("Erro ao criar download token:", dlError);
      return new Response(JSON.stringify({ error: "Erro interno ao gerar link" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 6. Gerar URL assinada do Supabase Storage ────────────
    // O arquivo_url pode ser um path no Storage (ex: "ebooks/vigilante.pdf")
    // ou uma URL completa já pública
    let downloadUrl: string;

    if (product.arquivo_url.startsWith("http")) {
      // URL externa já completa — usar diretamente
      downloadUrl = product.arquivo_url;
    } else {
      // Path no Supabase Storage — gerar URL assinada (72h = 259200 seg)
      const { data: signedData, error: signedError } = await sbAdmin
        .storage
        .from("ebooks")
        .createSignedUrl(product.arquivo_url, 259200);

      if (signedError || !signedData) {
        console.error("Erro ao assinar URL:", signedError);
        return new Response(JSON.stringify({ error: "Erro ao gerar URL de download" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      downloadUrl = signedData.signedUrl;
    }

    return new Response(
      JSON.stringify({
        download_url: downloadUrl,
        token:        dl.token,
        expira_em:    expiresAt,
        titulo:       product.titulo,
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
