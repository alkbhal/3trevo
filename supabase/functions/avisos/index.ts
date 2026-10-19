// supabase/functions/avisos/index.ts — avisos para o dono e contato automático com leitores.
// Chamada pelo banco (gatilho de compra e pg_cron; ver scripts/avisos.sql), autenticada pelo
// cabeçalho x-avisos-chave (avisos_config.chave). verify_jwt = false: o link de descadastro
// dos e-mails (GET ?acao=sair) também chega aqui, assinado com HMAC da mesma chave.
//
// POST { acao: "venda", purchase_id }  aviso de venda na hora
// POST { acao: "verificar" }           de hora em hora: pagou e não recebeu, erros do Worker
// POST { acao: "diario" }              8h de Brasília: resumo de ontem + e-mails aos leitores
// POST { acao: "mensal" }              dia 1º: extrato do mês anterior (CSV) x Mercado Pago
// POST { acao: "teste" }               manda ao dono um exemplo de cada aviso, com dados reais

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const sb = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND = Deno.env.get("RESEND_API_KEY");
const MP_TOKEN = Deno.env.get("MP_ACCESS_TOKEN");
const FROM = `Editora Três Trevo <${Deno.env.get("FROM_EMAIL") ?? "sac@3trevo.com.br"}>`;
const SITE = "https://3trevo.com.br";
const BRT = -3; // Brasília, UTC−3

type Cfg = { destinatario: string; chave: string };

// ── utilidades ───────────────────────────────────────────────────────────────
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (v: unknown) => BRL.format(Number(v) || 0);
const dataBR = (iso: string) => new Date(new Date(iso).getTime() + BRT * 3600e3).toISOString().slice(0, 16).replace("T", " ").replace(/^(\d{4})-(\d\d)-(\d\d)/, "$3/$2/$1");
const metodo = (m: unknown) => ({ pix: "PIX", credit_card: "cartão", debit_card: "débito", ticket: "boleto", account_money: "saldo MP" } as Record<string, string>)[String(m)] ?? (m ? String(m) : "—");

// Início do dia em Brasília, em UTC, com deslocamento de dias.
function diaBRT(desloc: number): Date {
  const agoraBR = new Date(Date.now() + BRT * 3600e3);
  return new Date(Date.UTC(agoraBR.getUTCFullYear(), agoraBR.getUTCMonth(), agoraBR.getUTCDate() + desloc, -BRT));
}
function mesBRT(desloc: number): Date {
  const agoraBR = new Date(Date.now() + BRT * 3600e3);
  return new Date(Date.UTC(agoraBR.getUTCFullYear(), agoraBR.getUTCMonth() + desloc, 1, -BRT));
}

async function hmac(chave: string, texto: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(chave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(texto));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

function moldura(titulo: string, corpo: string, rodape = "") {
  return `<!doctype html><html><body style="margin:0;background:#f4efe4;font-family:Helvetica,Arial,sans-serif;color:#262016">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fffdf9;border:1px solid #e3dccb">
<tr><td style="height:4px;background:#1e5c3a"></td></tr>
<tr><td style="padding:22px 28px 6px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8a6f28">✦ Editora Três Trevo</td></tr>
<tr><td style="padding:0 28px 8px"><h1 style="margin:0;font-family:Georgia,serif;font-weight:600;font-size:22px;line-height:1.3;color:#0f2d1a">${titulo}</h1></td></tr>
<tr><td style="padding:8px 28px 26px;font-size:15px;line-height:1.6">${corpo}</td></tr>
${rodape ? `<tr><td style="padding:14px 28px 22px;border-top:1px solid #eee6d6;font-size:12px;line-height:1.5;color:#7a7364">${rodape}</td></tr>` : ""}
</table></td></tr></table></body></html>`;
}
const linha = (k: string, v: string) => `<tr><td style="padding:6px 12px 6px 0;color:#7a7364;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 0">${v}</td></tr>`;
const tabela = (linhas: string) => `<table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;border-collapse:collapse">${linhas}</table>`;

async function enviar(para: string, assunto: string, html: string, extra: Record<string, unknown> = {}) {
  if (!RESEND) throw new Error("RESEND_API_KEY ausente");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [para], subject: assunto, html, reply_to: "sac@3trevo.com.br", ...extra }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function rpc<T>(nome: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.rpc(nome, args);
  if (error) throw new Error(`${nome}: ${error.message}`);
  return data as T;
}

// Marca como enviado; devolve true só na primeira vez (evita aviso/e-mail repetido).
async function primeiraVez(chave: string, tipo: string, user_id?: string | null): Promise<boolean> {
  const { data, error } = await sb.from("avisos_enviados")
    .upsert({ chave, tipo, user_id: user_id ?? null }, { onConflict: "chave", ignoreDuplicates: true }).select("chave");
  if (error) throw new Error(`avisos_enviados: ${error.message}`);
  return (data ?? []).length > 0;
}

// ── 1. venda ─────────────────────────────────────────────────────────────────
async function venda(cfg: Cfg, purchaseId: string, prefixo = "") {
  const v = await rpc<Record<string, any>>("avisos_dados_venda", { p_purchase: purchaseId });
  if (!v) return { ok: false, motivo: "compra não encontrada" };
  const nema = (Number(v.valor) || 0) * 0.2; // 10% do valor vira Nema; N$ 1 = R$ 0,50
  await enviar(cfg.destinatario, `${prefixo}✦ Venda: ${v.titulo} · ${brl(v.valor)}`, moldura(`Nova venda: ${brl(v.valor)}`,
    tabela(linha("Livro", esc(v.titulo)) + linha("Valor", brl(v.valor)) + linha("Pagamento", metodo(v.metodo)) +
      linha("Comprador", esc(v.nome ? `${v.nome} · ${v.email}` : v.email)) + linha("Quando", dataBR(v.criado_em)) +
      linha("Nema gerado", `N$ ${nema.toFixed(2).replace(".", ",")} (libera em 7 dias)`) +
      (v.afiliado ? linha("Afiliado", esc(v.afiliado)) : "") + (v.mp_payment_id ? linha("Mercado Pago", esc(v.mp_payment_id)) : "")),
    "O livro já foi liberado na área do cliente do comprador."));
  return { ok: true };
}

// ── 3. verificar ─────────────────────────────────────────────────────────────
function descreverPendencia(p: Record<string, any>) {
  if (p.tipo === "pagamento_sem_livro") {
    return `<li><strong>Pagou e não recebeu:</strong> ${esc(p.email)} · ${brl(p.valor)} · MP ${esc(p.mp_payment_id)} · ${dataBR(p.quando)}</li>`;
  }
  return `<li><strong>${esc(p.tipo)}</strong> · ${dataBR(p.quando)}<br><code style="font-size:12px">${esc(JSON.stringify(p.detalhe ?? {}).slice(0, 300))}</code></li>`;
}
async function verificar(cfg: Cfg, prefixo = "", forcar = false) {
  const pend = await rpc<Record<string, any>[]>("avisos_pendencias");
  const novas = [];
  for (const p of pend) if (forcar || await primeiraVez(p.chave, "alerta")) novas.push(p);
  if (!novas.length) return { ok: true, novas: 0 };
  await enviar(cfg.destinatario, `${prefixo}⚠ Atenção: ${novas.length} problema(s) no site`, moldura("Algo precisa da sua atenção",
    `<ul style="padding-left:18px;margin:0">${novas.map(descreverPendencia).join("")}</ul>
     <p style="margin-top:16px">Quem pagou e não recebeu: confira o pagamento no Mercado Pago e libere o livro pelo painel ou responda ao cliente em sac@3trevo.com.br.</p>`));
  return { ok: true, novas: novas.length };
}

// ── 4. leitores ──────────────────────────────────────────────────────────────
const TXT: Record<string, Record<string, string>> = {
  pt: {
    bv_assunto: "Sua área de leitura na Três Trevo está pronta",
    bv_titulo: "Boas-vindas, {nome}",
    bv_corpo: "Sua área de membro já está criada. Lá você escolhe um clássico da literatura brasileira, lê no leitor da editora com letra grande e modo noite, e o progresso fica salvo onde você parar.",
    lb_assunto: "Seu livro está esperando por você",
    lb_titulo: "Você parou em {pct}% de {titulo}",
    lb_corpo: "Sem pressa: o livro continua exatamente onde você deixou. Quando der vontade, é só abrir e seguir a leitura.",
    op_assunto: "Você terminou {titulo}. O que achou?",
    op_titulo: "Você chegou ao fim de {titulo}",
    op_corpo: "Que bom ter lido com a gente. Se quiser, responda este e-mail com uma frase sobre o livro: lemos todas as respostas. Quando quiser, troque de clássico na sua área.",
    botao: "Abrir minha área", sair: "Não quer mais receber lembretes e novidades?", sair_link: "Descadastrar",
    rodape: "Editora Três Trevo · sac@3trevo.com.br",
    sair_ok: "Pronto. Você não receberá mais lembretes nem novidades. E-mails sobre a sua conta e as suas compras continuam chegando.",
  },
  en: {
    bv_assunto: "Your reading room at Três Trevo is ready",
    bv_titulo: "Welcome, {nome}",
    bv_corpo: "Your member area is ready. Choose a classic of English literature and read it in our reader, with large type, night mode and your place always saved.",
    lb_assunto: "Your book is waiting for you",
    lb_titulo: "You stopped at {pct}% of {titulo}",
    lb_corpo: "No rush: the book is exactly where you left it. Whenever you feel like it, just open it and keep reading.",
    op_assunto: "You finished {titulo}. What did you think?",
    op_titulo: "You’ve reached the end of {titulo}",
    op_corpo: "We’re glad you read it with us. If you like, reply to this email with one sentence about the book — we read every reply. Whenever you want, pick your next classic in your member area.",
    botao: "Open my member area", sair: "Don’t want reminders and news anymore?", sair_link: "Unsubscribe",
    rodape: "Três Trevo · sac@3trevo.com.br",
    sair_ok: "Done. You won’t receive reminders or news anymore. Emails about your account and purchases will still arrive.",
  },
  es: {
    bv_assunto: "Tu sala de lectura en Três Trevo está lista",
    bv_titulo: "Te damos la bienvenida, {nome}",
    bv_corpo: "Tu área de miembro ya está creada. Elige un clásico de la literatura en español y léelo en nuestro lector, con letra grande, modo noche y tu progreso siempre guardado.",
    lb_assunto: "Tu libro te está esperando",
    lb_titulo: "Te quedaste en el {pct} % de {titulo}",
    lb_corpo: "Sin prisa: el libro sigue exactamente donde lo dejaste. Cuando te apetezca, ábrelo y sigue leyendo.",
    op_assunto: "Terminaste {titulo}. ¿Qué te pareció?",
    op_titulo: "Llegaste al final de {titulo}",
    op_corpo: "Nos alegra que lo hayas leído con nosotros. Si quieres, responde a este correo con una frase sobre el libro: leemos todas las respuestas. Cuando quieras, elige tu próximo clásico en tu área.",
    botao: "Abrir mi área", sair: "¿Ya no quieres recibir recordatorios ni novedades?", sair_link: "Darme de baja",
    rodape: "Três Trevo · sac@3trevo.com.br",
    sair_ok: "Listo. Ya no recibirás recordatorios ni novedades. Los correos sobre tu cuenta y tus compras seguirán llegando.",
  },
};
const fmt = (s: string, v: Record<string, unknown>) => s.replace(/\{(\w+)\}/g, (_, k) => esc(v[k] ?? ""));

async function emailLeitor(cfg: Cfg, l: Record<string, any>, para = l.email, prefixo = "") {
  const lang = TXT[l.idioma] ? l.idioma : "pt";
  const t = TXT[lang];
  const pre = { bv: "bv", lembrete: "lb", opiniao: "op", boas_vindas: "bv" }[l.tipo as string]!;
  const vars = { nome: l.nome || (lang === "en" ? "reader" : lang === "es" ? "lector" : "leitor"), titulo: l.titulo || "", pct: Math.round(Number(l.progresso) || 0) };
  const area = `${SITE}${lang === "pt" ? "" : "/" + lang}/area-cliente.html`;
  const botao = `<p style="margin:22px 0 4px"><a href="${area}" style="display:inline-block;background:#1e5c3a;color:#fff;text-decoration:none;padding:12px 22px;font-weight:600">${t.botao}</a></p>`;
  let rodape = t.rodape;
  if (pre !== "bv") {
    const tk = await hmac(cfg.chave, l.user_id);
    rodape += `<br>${t.sair} <a href="${SUPABASE_URL}/functions/v1/avisos?acao=sair&u=${l.user_id}&t=${tk}&l=${lang}" style="color:#7a7364">${t.sair_link}</a>`;
  }
  await enviar(para, prefixo + fmt(t[`${pre}_assunto`], vars), moldura(fmt(t[`${pre}_titulo`], vars), `<p style="margin:0">${t[`${pre}_corpo`]}</p>${botao}`, rodape));
}

async function leitores(cfg: Cfg) {
  const lista = await rpc<Record<string, any>[]>("avisos_leitores");
  let enviados = 0;
  for (const l of lista) {
    if (!(await primeiraVez(l.chave, l.tipo, l.user_id))) continue;
    try { await emailLeitor(cfg, l); enviados++; }
    catch (e) {
      await sb.from("avisos_enviados").delete().eq("chave", l.chave); // tenta de novo amanhã
      console.error("[leitores]", l.chave, String(e));
    }
  }
  return enviados;
}

// ── 2. diário ────────────────────────────────────────────────────────────────
async function diario(cfg: Cfg, prefixo = "", dias = 1) {
  const enviadosLeitores = prefixo ? 0 : await leitores(cfg);
  const ini = diaBRT(-dias), fim = diaBRT(0);
  const r = await rpc<Record<string, any>>("avisos_resumo", { p_ini: ini.toISOString(), p_fim: fim.toISOString() });
  const total = r.vendas.reduce((s: number, v: any) => s + (Number(v.valor) || 0), 0);
  const periodo = dias === 1 ? `ontem (${dataBR(ini.toISOString()).slice(0, 10)})` : `últimos ${dias} dias`;
  const vendas = r.vendas.length
    ? `<ul style="padding-left:18px;margin:6px 0 0">${r.vendas.map((v: any) => `<li>${esc(v.titulo)} · ${brl(v.valor)} · ${metodo(v.metodo)} · ${esc(v.email)}</li>`).join("")}</ul>`
    : "";
  const idiomas = Object.entries(r.novos_membros_idioma || {}).map(([k, n]) => `${String(k).toUpperCase()} ${n}`).join(" · ");
  const naoConc = Object.entries(r.nao_concluidos || {}).map(([k, n]) => `${k}: ${n}`).join(" · ");
  const problemas = [...(r.pendencias || [])];
  const corpo = tabela(
    linha("Vendas", `<strong>${r.vendas.length}</strong> · ${brl(total)}${vendas}`) +
    linha("Novos membros", `${r.novos_membros}${idiomas ? ` (${idiomas})` : ""} · total ${r.membros_total}`) +
    linha("Lendo um clássico", String(r.lendo_agora)) +
    linha("Pagamentos não concluídos", naoConc || "nenhum") +
    linha("E-mails a leitores", String(enviadosLeitores)) +
    linha("Problemas", problemas.length ? `<ul style="padding-left:18px;margin:0">${problemas.map(descreverPendencia).join("")}</ul>` : "nenhum"),
  );
  const assunto = r.vendas.length ? `${prefixo}☀ Resumo: ${r.vendas.length} venda(s), ${brl(total)}` : `${prefixo}☀ Resumo: sem vendas ${dias === 1 ? "ontem" : `em ${dias} dias`}`;
  await enviar(cfg.destinatario, assunto, moldura(`Resumo de ${periodo}`, corpo, "Este resumo chega todo dia às 8h. O aviso de cada venda chega na hora."));
  return { ok: true, vendas: r.vendas.length, leitores: enviadosLeitores };
}

// ── 5. mensal ────────────────────────────────────────────────────────────────
async function pagamentosMP(ini: Date, fim: Date) {
  if (!MP_TOKEN) return null;
  const itens: any[] = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const u = new URL("https://api.mercadopago.com/v1/payments/search");
    Object.entries({ sort: "date_created", criteria: "asc", range: "date_created", begin_date: ini.toISOString(), end_date: fim.toISOString(), status: "approved", limit: "100", offset: String(offset) })
      .forEach(([k, v]) => u.searchParams.set(k, v));
    const r = await fetch(u, { headers: { Authorization: `Bearer ${MP_TOKEN}` } });
    if (!r.ok) return null;
    const d = await r.json();
    itens.push(...(d.results ?? []));
    if ((d.results ?? []).length < 100) break;
  }
  return itens;
}
async function mensal(cfg: Cfg, prefixo = "", ini = mesBRT(-1), fim = mesBRT(0)) {
  const nossas = await rpc<Record<string, any>[]>("avisos_mes", { p_ini: ini.toISOString(), p_fim: fim.toISOString() });
  const mp = await pagamentosMP(ini, fim);
  const bruto = nossas.reduce((s, v) => s + (Number(v.valor) || 0), 0);
  const nomeMes = new Date(ini.getTime() + 12 * 3600e3).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  let conferencia = "Não consegui consultar o Mercado Pago agora; confira pelo painel (Relatórios → Vendas).";
  let mpLinhas = "";
  if (mp) {
    const taxa = mp.reduce((s, p) => s + (p.fee_details ?? []).reduce((a: number, f: any) => a + (Number(f.amount) || 0), 0), 0);
    const liquido = mp.reduce((s, p) => s + (Number(p.transaction_details?.net_received_amount) || 0), 0);
    const nossosIds = new Set(nossas.map((v) => String(v.mp_payment_id ?? "")));
    const mpIds = new Set(mp.map((p) => String(p.id)));
    const soMP = mp.filter((p) => !nossosIds.has(String(p.id)));
    const soNos = nossas.filter((v) => v.mp_payment_id && !mpIds.has(String(v.mp_payment_id)));
    mpLinhas = linha("Mercado Pago", `${mp.length} pagamento(s) aprovado(s) · bruto ${brl(mp.reduce((s, p) => s + (Number(p.transaction_amount) || 0), 0))} · taxas ${brl(taxa)} · <strong>líquido ${brl(liquido)}</strong>`);
    conferencia = soMP.length || soNos.length
      ? `<strong>Divergências:</strong><ul style="padding-left:18px;margin:4px 0 0">${soMP.map((p) => `<li>Só no Mercado Pago: ${esc(p.id)} · ${brl(p.transaction_amount)} · ${esc(p.payer?.email ?? "")}</li>`).join("")}${soNos.map((v) => `<li>Só no site: ${esc(v.mp_payment_id)} · ${brl(v.valor)} · ${esc(v.email)}</li>`).join("")}</ul>`
      : "Site e Mercado Pago batem: todas as vendas aparecem nos dois.";
  }
  const csv = ["data;livro;valor;pagamento;status;comprador;id_mercado_pago",
    ...nossas.map((v) => [dataBR(v.quando), v.titulo, (Number(v.valor) || 0).toFixed(2).replace(".", ","), metodo(v.metodo), v.status, v.email, v.mp_payment_id ?? ""]
      .map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";"))].join("\r\n");
  const arquivo = `extrato-3trevo-${ini.toISOString().slice(0, 7)}.csv`;
  await enviar(cfg.destinatario, `${prefixo}▤ Extrato de ${nomeMes}: ${nossas.length} venda(s), ${brl(bruto)}`, moldura(`Extrato de ${nomeMes}`,
    tabela(linha("Vendas no site", `<strong>${nossas.length}</strong> · bruto ${brl(bruto)}`) + mpLinhas + linha("Conferência", conferencia)) +
    `<p style="margin-top:16px">A planilha com cada venda vai anexa (${arquivo}; abre no Excel ou no Google Planilhas).</p>`,
    "O extrato oficial, com taxas e prazos de liberação, é o do Mercado Pago. Este serve para conferir os dois lados."),
    { attachments: [{ filename: arquivo, content: btoa(unescape(encodeURIComponent("﻿" + csv))) }] });
  return { ok: true, vendas: nossas.length, mp: mp ? mp.length : null };
}

// ── descadastro ──────────────────────────────────────────────────────────────
async function sair(cfg: Cfg, url: URL) {
  const u = url.searchParams.get("u") ?? "", t = url.searchParams.get("t") ?? "", l = url.searchParams.get("l") ?? "pt";
  const lang = TXT[l] ? l : "pt";
  const valido = /^[0-9a-f-]{36}$/.test(u) && t === await hmac(cfg.chave, u);
  if (valido) await rpc("avisos_sair", { p_user: u });
  const html = moldura(valido ? "✓" : "—", `<p>${valido ? TXT[lang].sair_ok : "Link inválido."}</p>`, TXT[lang].rodape);
  return new Response(html, { status: valido ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ── entrada ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const { data: cfg, error } = await sb.from("avisos_config").select("destinatario, chave").limit(1).maybeSingle();
  if (error || !cfg) return new Response("sem configuração", { status: 500 });
  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("acao") === "sair") return sair(cfg, url);
  if (req.method !== "POST" || req.headers.get("x-avisos-chave") !== cfg.chave) return new Response("não autorizado", { status: 401 });

  let corpo: Record<string, any> = {};
  try { corpo = await req.json(); } catch { /* corpo vazio */ }
  try {
    let r: unknown;
    switch (corpo.acao) {
      case "venda": r = await venda(cfg, String(corpo.purchase_id)); break;
      case "verificar": r = await verificar(cfg); break;
      case "diario": r = await diario(cfg); break;
      case "mensal": r = await mensal(cfg); break;
      case "teste": {
        const p = "[TESTE] ";
        const { data: ultima } = await sb.from("purchases").select("id").order("criado_em", { ascending: false }).limit(1).maybeSingle();
        const exemploLeitor = { tipo: "lembrete", user_id: "00000000-0000-0000-0000-000000000000", nome: "Rogério", idioma: "pt", titulo: "Dom Casmurro", progresso: 42 };
        r = {
          venda: ultima ? await venda(cfg, ultima.id, p) : "sem compras",
          verificar: await verificar(cfg, p, true),
          diario: await diario(cfg, p, 30),
          mensal: await mensal(cfg, p, mesBRT(0), new Date()),
          leitor: await emailLeitor(cfg, exemploLeitor, cfg.destinatario, p).then(() => "ok"),
        };
        break;
      }
      default: return new Response("ação desconhecida", { status: 400 });
    }
    return Response.json(r);
  } catch (e) {
    console.error("[avisos]", corpo.acao, String(e));
    return Response.json({ ok: false, erro: String(e) }, { status: 500 });
  }
});
