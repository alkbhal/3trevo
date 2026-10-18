// supabase/functions/livre-epub/index.ts
// Serve o EPUB do clássico (domínio público) que o membro grátis escolheu no seu único
// espaço de leitura (tabela leitura_livre). Os arquivos vêm do Project Gutenberg, que não
// manda CORS — por isso o navegador não baixa direto e a função faz a ponte.
// GET ?slug=dom-casmurro   Authorization: Bearer <sessão do usuário>
// verify_jwt = true no deploy (o gateway já recusa chamadas sem sessão).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};
const HOSTS_PERMITIDOS = new Set(["www.gutenberg.org", "gutenberg.org"]);

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "Método não permitido" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Entre na sua conta para ler." }, 401);

  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) return json({ error: "Obra inválida." }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: { user } } = await sb.auth.getUser(token);
  if (!user) return json({ error: "Sua sessão expirou. Entre de novo." }, 401);

  const { data: espaco } = await sb.from("leitura_livre")
    .select("acervo_slug").eq("user_id", user.id).maybeSingle();
  if (!espaco || espaco.acervo_slug !== slug) {
    return json({ error: "Escolha este clássico no seu espaço de leitura antes de abrir." }, 403);
  }

  const { data: obra } = await sb.from("biblioteca_acervo")
    .select("epub_url").eq("slug", slug).eq("ativo", true).eq("acesso", "bonus").maybeSingle();
  if (!obra?.epub_url) return json({ error: "Obra indisponível no momento." }, 404);

  let origem: URL;
  try { origem = new URL(obra.epub_url); } catch { return json({ error: "Obra indisponível no momento." }, 404); }
  if (origem.protocol !== "https:" || !HOSTS_PERMITIDOS.has(origem.hostname)) {
    return json({ error: "Obra indisponível no momento." }, 404);
  }

  const r = await fetch(origem, { headers: { "User-Agent": "EditoraTresTrevo/1.0 (+https://3trevo.com.br)" } });
  if (!r.ok || !r.body) return json({ error: "A biblioteca de origem não respondeu. Tente de novo em instantes." }, 502);

  return new Response(r.body, {
    headers: { ...CORS, "Content-Type": "application/epub+zip", "Cache-Control": "private, max-age=3600" },
  });
});
