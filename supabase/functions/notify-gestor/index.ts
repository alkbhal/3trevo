// supabase/functions/notify-gestor/index.ts
// Envia notificações internas para o gestor (ex: novo manuscrito, novo membro).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL     = Deno.env.get("FROM_EMAIL") ?? "sac@3trevo.com.br";
const SITE_URL       = Deno.env.get("SITE_URL") ?? "https://3trevo.com.br";

const corsHeaders = {
  "Access-Control-Allow-Origin": SITE_URL,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Nao autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: { user }, error: authErr } = await sb.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return new Response(JSON.stringify({ error: "Token invalido" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const { tipo, dados } = body;

    // Buscar emails dos gestores
    const { data: gestores } = await sb.from("admin_users").select("email, nome").eq("role", "gestor").eq("ativo", true);
    if (!gestores?.length) return new Response(JSON.stringify({ ok: true, aviso: "Nenhum gestor encontrado" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    let subject = "";
    let html    = "";
    const ano   = new Date().getFullYear();

    if (tipo === "manuscrito") {
      subject = `Novo manuscrito recebido - ${dados.titulo || "sem titulo"}`;
      html = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f0ebe0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0ebe0;padding:40px 0"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fdfbf7;border:1px solid rgba(26,74,46,.12)">
<tr><td style="height:4px;background:linear-gradient(90deg,#1a4a2e,#c8a84b)"></td></tr>
<tr><td style="padding:32px 48px 24px;border-bottom:1px solid rgba(26,74,46,.08)"><p style="margin:0;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#1a4a2e">Editora Tres Trevo</p></td></tr>
<tr><td style="padding:36px 48px 0">
<h1 style="margin:0 0 12px;font-size:26px;font-weight:300;color:#0f2d1a">Novo manuscrito recebido</h1>
<p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.7">Um escritor enviou um trabalho para avaliacao editorial.</p>
<table style="width:100%;background:#f5f0e8;border:1px solid rgba(26,74,46,.1);border-left:3px solid #c8a84b"><tr><td style="padding:20px 24px">
<p style="margin:0 0 6px;font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#8a6f28">Detalhes</p>
<p style="margin:0 0 4px;font-size:18px;font-weight:600;color:#0f2d1a">${dados.titulo || "—"}</p>
<p style="margin:0 0 4px;font-size:13px;color:#777">Genero: ${dados.genero || "—"}</p>
<p style="margin:0 0 4px;font-size:13px;color:#777">Autor: ${dados.autor_nome || dados.autor_email || "—"}</p>
<p style="margin:0;font-size:13px;color:#777">Email: ${dados.autor_email || "—"}</p>
${dados.sinopse ? `<p style="margin:12px 0 0;font-size:13px;color:#555;line-height:1.7;padding-top:12px;border-top:1px solid rgba(26,74,46,.1)"><em>${dados.sinopse}</em></p>` : ""}
</td></tr></table></td></tr>
<tr><td style="padding:24px 48px 32px"><a href="${SITE_URL}/admin.html" style="display:block;padding:14px;background:#1a4a2e;color:#f0ebe0;font-size:14px;font-weight:500;text-decoration:none;text-align:center">Acessar painel para revisar</a></td></tr>
<tr><td style="padding:20px 48px 28px;border-top:1px solid rgba(26,74,46,.08)"><p style="margin:0;font-size:11px;color:#999"><a href="${SITE_URL}" style="color:#1a4a2e;text-decoration:none">3trevo.com.br</a> | ${ano} Editora Tres Trevo</p></td></tr>
</table></td></tr></table></body></html>`;
    } else {
      return new Response(JSON.stringify({ error: "Tipo desconhecido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const emails = gestores.map(g => g.email);
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Editora Tres Trevo <${FROM_EMAIL}>`, to: emails, subject, html }),
    });

    return new Response(JSON.stringify({ ok: true, enviado_para: emails }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Erro:", err);
    return new Response(JSON.stringify({ error: "Erro interno" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
