// supabase/functions/get-download/index.ts
// Edge Function: gera link(s) de download seguro para um produto
// POST { product_id: string }
// Requer usuário autenticado (JWT no header Authorization)
// Devolve URL assinada (72h) pra cada formato disponível: PDF em products.arquivo_url,
// EPUB em products.epub_url — um produto pode ter só um dos dois, ou os dois.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// deno-lint-ignore no-explicit-any
async function assinarUrl(sbAdmin: any, arquivo: string): Promise<string | null> {
  if (arquivo.startsWith("http")) return arquivo;
  const { data, error } = await sbAdmin.storage.from("ebooks").createSignedUrl(arquivo, 259200);
  if (error || !data) return null;
  return data.signedUrl;
}

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

    if (access.expira_em && new Date(access.expira_em) < new Date()) {
      return new Response(JSON.stringify({ error: "Acesso ao conteúdo expirado." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Buscar arquivos do produto (PDF em arquivo_url, EPUB em epub_url) ──
    const { data: product } = await sbAdmin
      .from("products")
      .select("id, titulo, arquivo_url, epub_url")
      .eq("id", product_id)
      .single();

    if (!product?.arquivo_url && !product?.epub_url) {
      return new Response(JSON.stringify({ error: "Arquivo não disponível ainda. Entre em contato: sac@3trevo.com.br" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Registrar a solicitação (auditoria — a autorização real já aconteceu
    //      no passo 3; o Storage signed URL é autocontido, este registro é só rastreio) ──
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;

    await sbAdmin
      .from("downloads")
      .delete()
      .eq("user_id", user.id)
      .eq("product_id", product_id)
      .lt("expira_em", new Date().toISOString());

    const { error: dlError } = await sbAdmin
      .from("downloads")
      .insert({ user_id: user.id, product_id: product.id, expira_em: expiresAt, ip });

    if (dlError) {
      console.error("Erro ao registrar download (não bloqueia a entrega):", dlError);
    }

    // ── 6. Gerar URL assinada pra cada formato que existir ───
    // A chave é decidida pela EXTENSÃO real do arquivo, não pela coluna de onde veio —
    // arquivo_url historicamente guarda o "arquivo principal" e nem sempre é PDF
    // (vários títulos têm só EPUB nesse campo).
    // deno-lint-ignore no-explicit-any
    const formatos: Record<string, any> = {};

    const tipoDe = (nome: string): "pdf" | "epub" | null => {
      const n = nome.toLowerCase();
      if (n.endsWith(".pdf")) return "pdf";
      if (n.endsWith(".epub")) return "epub";
      return null;
    };

    for (const campo of [product.arquivo_url, product.epub_url]) {
      if (!campo) continue;
      const tipo = tipoDe(campo);
      if (!tipo || formatos[tipo]) continue; // já preenchido, não sobrescreve
      const url = await assinarUrl(sbAdmin, campo);
      if (url) formatos[tipo] = { download_url: url, expira_em: expiresAt };
    }

    if (Object.keys(formatos).length === 0) {
      return new Response(JSON.stringify({ error: "Erro ao gerar URL de download" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ titulo: product.titulo, formatos }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Erro inesperado:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
