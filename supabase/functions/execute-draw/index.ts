// supabase/functions/execute-draw/index.ts
// Edge Function: executa o sorteio pela cartela de números
//
// ALGORITMO (cartela-mulberry32):
//   1. Carrega todos os números atribuídos da cartela (draw_numbers).
//   2. Gera um seed determinístico (manual do admin ou timestamp+hash).
//   3. Usa Mulberry32 PRNG para sortear um número aleatório entre 1 e max_numeros.
//   4. O dono do número sorteado é o 1º lugar.
//   5. Para 2º lugar: sorteia outro número (pulando caso caia no mesmo user_id).
//   6. Se o número sorteado não estiver atribuído (livre na cartela), repete até
//      encontrar um atribuído — máximo 1000 tentativas, depois fallback ponderado.
//   7. Registra snapshot imutável + SHA-256 em draw_audits.
//
// POST { draw_id, admin_seed? }
// Requer header Authorization: Bearer <admin_token>

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL    = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL     = Deno.env.get("ADMIN_EMAIL") || "al_kbhal@yahoo.com.br";
const RESEND_API_KEY  = Deno.env.get("RESEND_API_KEY") || "";
const SITE_URL        = Deno.env.get("SITE_URL") || "https://3trevo.com.br";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────
// MULBERRY32 PRNG — seed determinístico de 32 bits
// Dado o mesmo seed, produz exatamente a mesma sequência.
// Qualquer pessoa pode reproduzir o sorteio com o seed público.
// ─────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return function (): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// djb2: converte string→uint32 (determinístico, sem crypto)
function seedFromString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return h >>> 0;
}

// SHA-256 hex via Web Crypto (Deno nativo)
async function sha256hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***@***";
  return `${local[0]}***@${domain}`;
}

// ─────────────────────────────────────────────────────────────
// Sorteia um número da cartela usando Mulberry32.
// Estratégia: gera número aleatório em [1..maxNumeros].
// Se não estiver atribuído, sorteia novamente (até maxTentativas).
// Fallback: se esgotar tentativas sem cair num número atribuído,
// usa seleção aleatória direta sobre a lista de atribuídos.
// ─────────────────────────────────────────────────────────────
function sortearNumero(
  rand: () => number,
  maxNumeros: number,
  atribuidos: Set<number>,
  excluirUser?: string,
  userNumeros?: Map<string, number[]>,
): { numero: number; via: "direto" | "fallback" } {
  const MAX_TENTATIVAS = 2000;

  // Tentativas diretas: sorteia [1..maxNumeros] até cair em atribuído
  for (let i = 0; i < MAX_TENTATIVAS; i++) {
    const n = Math.floor(rand() * maxNumeros) + 1;
    if (atribuidos.has(n)) {
      // Se excluirUser especificado, pular se esse user já foi selecionado como 1º
      if (excluirUser && userNumeros) {
        const donoNums = userNumeros.get(excluirUser) || [];
        if (donoNums.includes(n)) continue;
      }
      return { numero: n, via: "direto" };
    }
  }

  // Fallback: lista de números atribuídos (excluindo user se necessário)
  let candidatos: number[];
  if (excluirUser && userNumeros) {
    const numsExcluidos = new Set(userNumeros.get(excluirUser) || []);
    candidatos = [...atribuidos].filter(n => !numsExcluidos.has(n));
  } else {
    candidatos = [...atribuidos];
  }

  if (candidatos.length === 0) throw new Error("Sem candidatos para 2º lugar");
  const idx = Math.floor(rand() * candidatos.length);
  return { numero: candidatos[idx], via: "fallback" };
}

// ─────────────────────────────────────────────────────────────
// Email ao vencedor via Resend
// ─────────────────────────────────────────────────────────────
async function enviarEmailVencedor(
  email: string,
  posicao: number,
  premio: string,
  drawTitulo: string,
  drawId: string,
  numero: number,
): Promise<void> {
  if (!RESEND_API_KEY) return;

  const auditUrl  = `${SITE_URL}/auditoria-sorteio.html?draw_id=${drawId}`;
  const posLabel  = posicao === 1 ? "1º Lugar 🥇" : "2º Lugar 🥈";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Jost',sans-serif;background:#0f2d1a;color:#fdfbf7;margin:0;padding:0">
  <div style="max-width:560px;margin:0 auto;padding:48px 32px">
    <div style="font-family:Georgia,serif;font-size:26px;color:#c8a84b;margin-bottom:4px">✦ Editora Três Trevo</div>
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:40px">Programa Cultural</div>
    <div style="border:1px solid rgba(200,168,75,.3);padding:32px;background:rgba(255,255,255,.02)">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#c8a84b;margin-bottom:12px">${posLabel}</div>
      <div style="font-family:Georgia,serif;font-size:30px;font-weight:400;margin-bottom:12px">Parabéns! Você ganhou.</div>
      <p style="font-size:14px;color:rgba(255,255,255,.6);line-height:1.8;margin-bottom:20px">
        Seu número <strong style="color:#c8a84b;font-size:20px">${numero.toLocaleString('pt-BR')}</strong>
        foi sorteado como <strong style="color:#c8a84b">${posLabel}</strong>
        no sorteio <strong>${drawTitulo}</strong>.
      </p>
      <div style="background:rgba(200,168,75,.08);border:1px solid rgba(200,168,75,.2);padding:16px;margin-bottom:20px">
        <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:6px">Seu prêmio</div>
        <div style="font-family:Georgia,serif;font-size:20px;color:#c8a84b">${premio}</div>
      </div>
      <p style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:20px">
        Para resgatar, responda este e-mail ou escreva para
        <a href="mailto:sac@3trevo.com.br" style="color:#c8a84b">sac@3trevo.com.br</a>
      </p>
      <a href="${auditUrl}" style="display:inline-block;padding:12px 24px;background:#c8a84b;color:#1a4a2e;text-decoration:none;font-size:12px;font-weight:500">
        Ver auditoria pública do sorteio →
      </a>
    </div>
    <div style="margin-top:28px;font-size:11px;color:rgba(255,255,255,.2);line-height:1.7">
      Editora Três Trevo · CNPJ 18.928.966/0001-59 · Montauri/RS
    </div>
  </div>
</body>
</html>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Editora Três Trevo <noreply@3trevo.com.br>",
      to: [email],
      subject: `✦ Número ${numero} sorteado! ${posLabel} — ${drawTitulo}`,
      html,
    }),
  }).catch(e => console.error("[EMAIL] Erro:", e));
}

// ─────────────────────────────────────────────────────────────
// HANDLER PRINCIPAL
// ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── 1. Autenticar admin ──────────────────────────────────
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

    // Sorteio automático (chamado internamente) usa service role — verificar header especial
    const isInternal = req.headers.get("X-Internal-Key") === SERVICE_KEY;

    if (!isInternal && user.email !== ADMIN_EMAIL) {
      return new Response(JSON.stringify({ error: "Acesso restrito ao administrador" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Ler body ──────────────────────────────────────────
    const { draw_id, admin_seed } = await req.json();
    if (!draw_id) {
      return new Response(JSON.stringify({ error: "draw_id é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 3. Verificar sorteio ─────────────────────────────────
    const { data: draw, error: drawErr } = await sb
      .from("draws")
      .select("id, titulo, status, premio_1, premio_2, max_numeros, meta_tipo, meta_valor, meta_atual")
      .eq("id", draw_id)
      .single();

    if (drawErr || !draw) {
      return new Response(JSON.stringify({ error: "Sorteio não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (draw.status === "drawn") {
      const { data: existing } = await sb.from("draw_audits").select("*").eq("draw_id", draw_id).single();
      return new Response(JSON.stringify({ error: "Sorteio já realizado", audit: existing }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 4. Buscar todos os números da cartela ────────────────
    const { data: numerosDB, error: numErr } = await sb
      .from("draw_numbers")
      .select("numero, user_id, origem")
      .eq("draw_id", draw_id)
      .order("numero");

    if (numErr) {
      return new Response(JSON.stringify({ error: "Erro ao buscar cartela: " + numErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!numerosDB || numerosDB.length === 0) {
      return new Response(JSON.stringify({ error: "Cartela vazia — nenhum número atribuído nesta rodada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filtrar participantes não-reembolsados
    const userIds = [...new Set(numerosDB.filter(n => n.user_id).map(n => n.user_id as string))];
    const { data: purchases } = await sb
      .from("purchases")
      .select("user_id, status")
      .in("user_id", userIds);
    const refundedSet = new Set(
      (purchases || []).filter(p => p.status === "refunded").map(p => p.user_id)
    );

    // Filtrar números de usuários reembolsados
    const numerosValidos = numerosDB.filter(n => !n.user_id || !refundedSet.has(n.user_id));

    if (numerosValidos.length === 0) {
      return new Response(JSON.stringify({ error: "Todos os participantes foram reembolsados" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mapas úteis
    const atribuidos  = new Set(numerosValidos.map(n => n.numero));
    const numToUser   = new Map(numerosValidos.filter(n => n.user_id).map(n => [n.numero, n.user_id as string]));
    const userNumeros = new Map<string, number[]>();
    for (const n of numerosValidos) {
      if (!n.user_id) continue;
      if (!userNumeros.has(n.user_id)) userNumeros.set(n.user_id, []);
      userNumeros.get(n.user_id)!.push(n.numero);
    }

    // Buscar emails
    const emailMap: Record<string, string> = {};
    for (const uid of userIds) {
      const { data: { user: u } } = await sb.auth.admin.getUserById(uid);
      if (u?.email) emailMap[uid] = u.email;
    }

    // ── 5. Gerar seed ────────────────────────────────────────
    const timestampMs = Date.now();
    const idsHash     = await sha256hex(numerosValidos.map(n => `${n.numero}:${n.user_id || ''}`).sort().join(","));
    const seedStr     = admin_seed
      ? String(admin_seed).trim()
      : `${timestampMs}-${idsHash.substring(0, 16)}`;

    const seedNum = seedFromString(seedStr);
    const rand    = mulberry32(seedNum);
    const maxN    = draw.max_numeros || 100000;

    // ── 6. Sortear 1º lugar ──────────────────────────────────
    const { numero: num1, via: via1 } = sortearNumero(rand, maxN, atribuidos);
    const userId1 = numToUser.get(num1);
    if (!userId1) {
      return new Response(JSON.stringify({ error: `Número sorteado (${num1}) não está atribuído` }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 7. Sortear 2º lugar (dono diferente) ─────────────────
    let num2: number | null   = null;
    let userId2: string | null = null;
    const numeros2user = userNumeros.get(userId1) || [];
    const atrib2       = new Set([...atribuidos].filter(n => !numeros2user.includes(n)));

    if (atrib2.size > 0) {
      const { numero: n2 } = sortearNumero(rand, maxN, atrib2, userId1, userNumeros);
      num2    = n2;
      userId2 = numToUser.get(n2) || null;
    }

    // ── 8. Montar snapshot de participantes (emails mascarados) ──
    const participantesMap = new Map<string, { email_masked: string; numeros: number[] }>();
    for (const [uid, nums] of userNumeros) {
      participantesMap.set(uid, {
        email_masked: maskEmail(emailMap[uid] || ""),
        numeros: nums.sort((a, b) => a - b),
      });
    }

    const participantes = [...participantesMap.entries()].map(([uid, p]) => ({
      user_id:       uid,
      email_masked:  p.email_masked,
      numeros:       p.numeros,
      total_numeros: p.numeros.length,
    })).sort((a, b) => a.user_id.localeCompare(b.user_id));

    // Snapshot completo da cartela (com emails mascarados)
    const cartelaSnapshot = numerosValidos.map(n => ({
      numero:       n.numero,
      user_id:      n.user_id || null,
      email_masked: n.user_id ? maskEmail(emailMap[n.user_id] || "") : null,
      origem:       n.origem,
    })).sort((a, b) => a.numero - b.numero);

    const resultado = [
      { posicao: 1, user_id: userId1, email_masked: maskEmail(emailMap[userId1] || ""), numero_sorteado: num1, via: via1 },
      ...(userId2 ? [{ posicao: 2, user_id: userId2, email_masked: maskEmail(emailMap[userId2] || ""), numero_sorteado: num2, via: "direto" }] : []),
    ];

    // ── 9. Hash de auditoria ─────────────────────────────────
    const canonicalJson = JSON.stringify({
      draw_id,
      seed:            seedStr,
      algoritmo:       "cartela-mulberry32",
      max_numeros:     maxN,
      numero_sorteado: num1,
      participantes,
      resultado,
    });
    const hash = await sha256hex(canonicalJson);

    // ── 10. Persistir draw_audit ─────────────────────────────
    const { error: auditErr } = await sb.from("draw_audits").insert({
      draw_id,
      seed:            seedStr,
      algoritmo:       "cartela-mulberry32",
      numero_sorteado: num1,
      cartela:         cartelaSnapshot,
      participantes,
      resultado,
      hash_sha256:     hash,
      executado_por:   isInternal ? null : user.id,
    });

    if (auditErr) {
      console.error("Erro ao salvar auditoria:", auditErr);
      return new Response(JSON.stringify({ error: "Erro ao salvar auditoria: " + auditErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 11. Persistir draw_winners ───────────────────────────
    const winnersRows = [
      { draw_id, user_id: userId1, posicao: 1, cotas_total: (userNumeros.get(userId1) || []).length, premio: draw.premio_1 || null, nome_publico: maskEmail(emailMap[userId1] || "") },
      ...(userId2 ? [{ draw_id, user_id: userId2, posicao: 2, cotas_total: (userNumeros.get(userId2) || []).length, premio: draw.premio_2 || null, nome_publico: maskEmail(emailMap[userId2] || "") }] : []),
    ];
    await sb.from("draw_winners").insert(winnersRows);

    // ── 12. Atualizar draws (status + numero_sorteado) ───────
    await sb.from("draws").update({ status: "drawn", numero_sorteado: num1 }).eq("id", draw_id);

    // ── 13. Criar próxima rodada automaticamente ─────────────
    const rodadaNum   = (draw.titulo?.match(/(\d+)/) || [])[1];
    const nextNum     = rodadaNum ? parseInt(rodadaNum) + 1 : 1;
    const nextTitulo  = draw.titulo?.replace(/\d+/, String(nextNum)) || `Rodada ${nextNum}`;

    await sb.from("draws").insert({
      titulo:      nextTitulo,
      status:      "open",
      premio_1:    draw.premio_1,
      premio_2:    draw.premio_2,
      meta_tipo:   draw.meta_tipo,
      meta_valor:  draw.meta_valor,
      meta_atual:  0,
      max_numeros: maxN,
    });

    // ── 14. Enviar emails para vencedores ────────────────────
    if (emailMap[userId1] && draw.premio_1) {
      await enviarEmailVencedor(emailMap[userId1], 1, draw.premio_1, draw.titulo || "Sorteio", draw_id, num1);
    }
    if (userId2 && emailMap[userId2] && draw.premio_2 && num2) {
      await enviarEmailVencedor(emailMap[userId2], 2, draw.premio_2, draw.titulo || "Sorteio", draw_id, num2);
    }

    return new Response(
      JSON.stringify({
        success:         true,
        draw_id,
        seed:            seedStr,
        hash_sha256:     hash,
        algoritmo:       "cartela-mulberry32",
        max_numeros:     maxN,
        numero_sorteado: num1,
        total_numeros_cartela: numerosValidos.length,
        total_participantes: participantesMap.size,
        resultado,
        proxima_rodada:  nextTitulo,
        auditoria_url:   `${SITE_URL}/auditoria-sorteio.html?draw_id=${draw_id}`,
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
