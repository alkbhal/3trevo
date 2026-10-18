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
// tr3vo-forge: arquivos só abrem com link assinado (mesmo segredo do forge).
const FORGE_URL    = (Deno.env.get("FORGE_PUBLIC_URL") ?? "https://tr3vo-forge.al-kbhal.workers.dev").replace(/\/+$/, "");
const FORGE_SECRET = Deno.env.get("FORGE_DOWNLOAD_SECRET") ?? "";
const FORGE_TTL_S  = 15 * 60;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// URL do forge → { projectId, formato }; mesmo formato de worker/src/forge-download.ts.
function arquivoForge(url: string): { projectId: string; formato: string } | null {
  if (!url.toLowerCase().startsWith(FORGE_URL.toLowerCase() + "/")) return null;
  const m = url.slice(FORGE_URL.length).match(/^\/project\/([0-9a-f-]{36})\/(epub|pdf)$/i);
  return m ? { projectId: m[1].toLowerCase(), formato: m[2].toLowerCase() } : null;
}

async function assinarForge(projectId: string, formato: string): Promise<string | null> {
  if (!FORGE_SECRET) { console.error("FORGE_DOWNLOAD_SECRET ausente — link do forge não assinado"); return null; }
  const exp = Math.floor(Date.now() / 1000) + FORGE_TTL_S;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(FORGE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${projectId}.${formato}.${exp}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${FORGE_URL}/project/${projectId}/${formato}?exp=${exp}&sig=${hex}`;
}

// deno-lint-ignore no-explicit-any
async function assinarUrl(sbAdmin: any, arquivo: string): Promise<string | null> {
  const forge = arquivoForge(arquivo);
  if (forge) return assinarForge(forge.projectId, forge.formato);
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
      const forge = arquivoForge(nome);
      if (forge) return forge.formato as "pdf" | "epub";
      return null;
    };

    for (const campo of [product.arquivo_url, product.epub_url]) {
      if (!campo) continue;
      const tipo = tipoDe(campo);
      if (!tipo || formatos[tipo]) continue; // já preenchido, não sobrescreve
      const url = await assinarUrl(sbAdmin, campo);
      // Link do forge vale 15 min (gerado a cada pedido); Storage, 72h.
      const expira = arquivoForge(campo) ? new Date(Date.now() + FORGE_TTL_S * 1000).toISOString() : expiresAt;
      if (url) formatos[tipo] = { download_url: url, expira_em: expira };
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
