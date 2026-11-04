// supabase/functions/get-media/index.ts
// Dois modos:
// ?track=key   → allowlist hardcoded (sem auth)
// ?id=uuid     → busca em musicas, verifica gratuita/user_library
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL     = Deno.env.get("SITE_URL") ?? "https://3trevo.com.br";

const ALLOWLIST: Record<string, { bucket: string; path: string }> = {
  "trilha": { bucket: "media", path: "trilha.m4a" },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url   = new URL(req.url);
  const track = url.searchParams.get("track");
  const id    = url.searchParams.get("id");
  const sb    = createClient(SUPABASE_URL, SERVICE_KEY);

  // ── Modo 1: allowlist por key ────────────────────────────────
  if (track) {
    const entry = ALLOWLIST[track];
    if (!entry) return json({ error: "Faixa não encontrada" }, 404);

    const { data, error } = await sb.storage.from(entry.bucket).createSignedUrl(entry.path, 3600);
    if (error || !data?.signedUrl) return json({ error: "Erro ao gerar link" }, 500);
    return json({ url: data.signedUrl });
  }

  // ── Modo 2: por ID da tabela musicas ─────────────────────────
  if (id) {
    const { data: musica, error: mErr } = await sb
      .from("musicas").select("*").eq("id", id).eq("ativo", true).single();

    if (mErr || !musica) return json({ error: "Faixa não encontrada" }, 404);

    // Faixa bloqueada — verificar compra
    if (!musica.gratuita && musica.produto_id) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Login necessário para esta faixa" }, 401);

      const { data: { user }, error: uErr } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
      if (uErr || !user) return json({ error: "Token inválido" }, 401);

      const { data: lib } = await sb
        .from("user_library").select("id")
        .eq("user_id", user.id).eq("product_id", musica.produto_id).single();

      if (!lib) return json({
        error: "Adquira o livro deste universo para desbloquear esta faixa",
        produto_id: musica.produto_id,
        universo_slug: musica.universo_slug,
      }, 403);
    }

    const { data, error } = await sb.storage.from("media").createSignedUrl(musica.arquivo_url, 3600);
    if (error || !data?.signedUrl) return json({ error: "Erro ao gerar link de áudio" }, 500);

    return json({
      url: data.signedUrl,
      titulo: musica.titulo,
      artista: musica.artista,
      genero: musica.genero,
      universo_slug: musica.universo_slug,
      bg_color: musica.bg_color,
      capa_url: musica.capa_url,
    });
  }

  return json({ error: "Parâmetro track ou id obrigatório" }, 400);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
