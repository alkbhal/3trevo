// supabase/functions/execute-draw/index.ts
//
// Engine Bitcoin SHA-256 + BigInt — IDÊNTICO ao Loteria-TT engine.ts
// Auditável · Determinístico · Imutável por interferência humana
//
// ALGORITMO (sha256-bigint-v1):
//   1. Admin fornece bitcoin_block_hash (obrigatório, mínimo 6 confirmações).
//   2. Snapshot: lista ordenada (ASC) de todos os draw_numbers ativos.
//   3. snapshotHash = SHA-256(numeros.join("\n"))
//   4. Para cada posição P ∈ {1, 2}:
//      algoritmoInput = `${bitcoinHash}:${drawIdSemHifens}:${P}`
//      algoritmoHash  = SHA-256(algoritmoInput)
//      indice         = BigInt("0x" + algoritmoHash) % BigInt(n)
//      vencedor       = snapshot[indice]
//   5. Tudo registrado em draw_audits.details (append-only, imutável).
//
// REPRODUÇÃO PÚBLICA:
//   Qualquer pessoa com: draw_id + bitcoin_block_hash + lista de números
//   pode executar o mesmo algoritmo e obter o mesmo resultado.
//
// POST { draw_id, bitcoin_block_hash }
// Authorization: Bearer <supabase_access_token>

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL   = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY    = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_EMAIL    = Deno.env.get("ADMIN_EMAIL") || "al_kbhal@yahoo.com.br";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SITE_URL       = Deno.env.get("SITE_URL") || "https://3trevo.com.br";

const BITCOIN_PRIMARY  = "https://blockstream.info/api";
const BITCOIN_FALLBACK = "https://mempool.space/api";
const MIN_CONFIRMACOES = 6;

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── SHA-256 via Web Crypto (Deno nativo) ──────────────────────────────────────
async function sha256hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(str),
  );
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Core engine — mesmo algoritmo do Loteria-TT engine.ts ────────────────────
// Dado o mesmo conjunto de entradas, produz exatamente o mesmo indice.
// Sem estado interno, sem Math.random(), sem truncagem de bits.
async function executarAlgoritmo(
  bitcoinHash: string,
  drawId: string,
  posicao: number,
  n: number,
): Promise<{ indice: number; algoritmoInput: string; algoritmoHash: string }> {
  if (n <= 0) throw new Error("n deve ser > 0");
  const drawIdSemHifens = drawId.replace(/-/g, "").toLowerCase();
  const algoritmoInput  = `${bitcoinHash}:${drawIdSemHifens}:${posicao}`;
  const algoritmoHash   = await sha256hex(algoritmoInput);
  const hashInt         = BigInt("0x" + algoritmoHash);
  const indice          = Number(hashInt % BigInt(n));
  return { indice, algoritmoInput, algoritmoHash };
}

// ── Bitcoin block — busca com fallback ────────────────────────────────────────
interface BitcoinBlock {
  id: string;
  height: number;
  timestamp: number;
}

async function fetchBitcoinBlock(hash: string): Promise<BitcoinBlock> {
  const urls = [
    `${BITCOIN_PRIMARY}/block/${hash}`,
    `${BITCOIN_FALLBACK}/block/${hash}`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return await res.json() as BitcoinBlock;
    } catch { /* tenta fallback */ }
  }
  throw new Error("Bloco Bitcoin não encontrado em nenhuma fonte");
}

async function fetchTipHeight(): Promise<number> {
  const urls = [
    `${BITCOIN_PRIMARY}/blocks/tip/height`,
    `${BITCOIN_FALLBACK}/blocks/tip/height`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return parseInt(await res.text());
    } catch { /* tenta fallback */ }
  }
  return -1;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***@***";
  return `${local[0]}***@${domain}`;
}

// ── Email ao vencedor via Resend ──────────────────────────────────────────────
async function enviarEmailVencedor(
  email: string,
  posicao: number,
  premio: string,
  drawTitulo: string,
  drawId: string,
  numero: number,
): Promise<void> {
  if (!RESEND_API_KEY) return;
  const auditUrl = `${SITE_URL}/auditoria-sorteio.html?draw_id=${drawId}`;
  const posLabel = posicao === 1 ? "1º Lugar 🥇" : "2º Lugar 🥈";
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"></head>
<body style="font-family:'Jost',sans-serif;background:#0f2d1a;color:#fdfbf7;margin:0;padding:0">
  <div style="max-width:560px;margin:0 auto;padding:48px 32px">
    <div style="font-family:Georgia,serif;font-size:26px;color:#c8a84b;margin-bottom:4px">✦ Editora Três Trevo</div>
    <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,.3);margin-bottom:40px">Programa Cultural</div>
    <div style="border:1px solid rgba(200,168,75,.3);padding:32px;background:rgba(255,255,255,.02)">
      <div style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#c8a84b;margin-bottom:12px">${posLabel}</div>
      <div style="font-family:Georgia,serif;font-size:30px;font-weight:400;margin-bottom:12px">Parabéns! Você foi selecionado(a).</div>
      <p style="font-size:14px;color:rgba(255,255,255,.6);line-height:1.8;margin-bottom:20px">
        Seu número <strong style="color:#c8a84b;font-size:20px">${numero.toLocaleString("pt-BR")}</strong>
        foi selecionado como <strong style="color:#c8a84b">${posLabel}</strong>
        na premiação <strong>${drawTitulo}</strong>.
      </p>
      <div style="background:rgba(200,168,75,.08);border:1px solid rgba(200,168,75,.2);padding:16px;margin-bottom:20px">
        <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.4);margin-bottom:6px">Sua premiação</div>
        <div style="font-family:Georgia,serif;font-size:20px;color:#c8a84b">${premio}</div>
      </div>
      <p style="font-size:13px;color:rgba(255,255,255,.5);margin-bottom:20px">
        Para resgatar, responda este e-mail ou escreva para
        <a href="mailto:sac@3trevo.com.br" style="color:#c8a84b">sac@3trevo.com.br</a>
      </p>
      <a href="${auditUrl}" style="display:inline-block;padding:12px 24px;background:#c8a84b;color:#1a4a2e;text-decoration:none;font-size:12px;font-weight:500">
        Verificar auditoria pública →
      </a>
    </div>
    <div style="margin-top:28px;font-size:11px;color:rgba(255,255,255,.2);line-height:1.7">
      Editora Três Trevo · CNPJ 18.928.966/0001-59 · Montauri/RS<br>
      Algoritmo: sha256-bigint-v1 · Semente: Bitcoin blockchain
    </div>
  </div>
</body>
</html>`;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Editora Três Trevo <noreply@3trevo.com.br>",
      to:   [email],
      subject: `✦ Número ${numero.toLocaleString("pt-BR")} selecionado! ${posLabel} — ${drawTitulo}`,
      html,
    }),
  }).catch(e => console.error("[EMAIL]", e));
}

// ── Handler principal ─────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Autenticar admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Não autorizado" }, 401);

    const sb    = createClient(SUPABASE_URL, SERVICE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await sb.auth.getUser(token);
    if (authErr || !user) return jsonResponse({ error: "Token inválido" }, 401);

    const isInternal = req.headers.get("X-Internal-Key") === SERVICE_KEY;
    if (!isInternal && user.email !== ADMIN_EMAIL) {
      return jsonResponse({ error: "Acesso restrito ao administrador" }, 403);
    }

    // 2. Parse body
    const body = await req.json().catch(() => ({}));
    const { draw_id, bitcoin_block_hash } = body;

    if (!draw_id) return jsonResponse({ error: "draw_id é obrigatório" }, 400);
    if (!bitcoin_block_hash || String(bitcoin_block_hash).trim().length < 60) {
      return jsonResponse({
        error: "bitcoin_block_hash é obrigatório. Use o hash (64 chars hex) de um bloco Bitcoin com mínimo 6 confirmações.",
      }, 400);
    }
    const btcHash = String(bitcoin_block_hash).trim().toLowerCase();

    // 3. Verificar draw
    const { data: draw, error: drawErr } = await sb
      .from("draws")
      .select("id, titulo, status, premio_1, premio_2, max_numeros, meta_tipo, meta_valor, meta_atual")
      .eq("id", draw_id)
      .single();

    if (drawErr || !draw) return jsonResponse({ error: "Rodada não encontrada" }, 404);
    if (draw.status === "drawn") {
      const { data: existing } = await sb.from("draw_audits").select("*").eq("draw_id", draw_id).single();
      return jsonResponse({ error: "Rodada já realizada", auditoria: existing }, 409);
    }

    // 4. Validar bloco Bitcoin
    let bloco: BitcoinBlock;
    let confirmacoes: number;
    try {
      bloco        = await fetchBitcoinBlock(btcHash);
      const tip    = await fetchTipHeight();
      confirmacoes = tip >= bloco.height ? tip - bloco.height + 1 : 0;
    } catch (e) {
      return jsonResponse({ error: `Bloco Bitcoin inválido: ${e}` }, 400);
    }

    if (confirmacoes < MIN_CONFIRMACOES) {
      return jsonResponse({
        error: `Bloco com ${confirmacoes} confirmação(ões). Mínimo obrigatório: ${MIN_CONFIRMACOES}. Aguarde e tente novamente.`,
        bloco_height: bloco.height,
        confirmacoes,
        faltam: MIN_CONFIRMACOES - confirmacoes,
      }, 400);
    }

    // 5. Buscar draw_numbers (snapshot)
    const { data: numerosDB, error: numErr } = await sb
      .from("draw_numbers")
      .select("numero, user_id, origem")
      .eq("draw_id", draw_id)
      .order("numero", { ascending: true });

    if (numErr) return jsonResponse({ error: "Erro ao buscar cartela: " + numErr.message }, 500);
    if (!numerosDB || numerosDB.length === 0) {
      return jsonResponse({ error: "Cartela vazia — nenhum número atribuído nesta rodada" }, 400);
    }

    // Excluir participantes reembolsados
    const userIds     = [...new Set(numerosDB.filter(n => n.user_id).map(n => n.user_id as string))];
    const { data: purchases } = await sb.from("purchases").select("user_id, status").in("user_id", userIds);
    const refundedSet = new Set((purchases || []).filter(p => p.status === "refunded").map(p => p.user_id));
    const numerosValidos = numerosDB.filter(n => !n.user_id || !refundedSet.has(n.user_id));

    if (numerosValidos.length === 0) return jsonResponse({ error: "Todos os participantes foram reembolsados" }, 400);

    // Mapas
    const numeros    = numerosValidos.map(n => n.numero as number).sort((a, b) => a - b);
    const numToUser  = new Map(numerosValidos.filter(n => n.user_id).map(n => [n.numero as number, n.user_id as string]));
    const userNums   = new Map<string, number[]>();
    for (const n of numerosValidos) {
      if (!n.user_id) continue;
      if (!userNums.has(n.user_id)) userNums.set(n.user_id, []);
      userNums.get(n.user_id)!.push(n.numero as number);
    }

    // Buscar emails
    const emailMap: Record<string, string> = {};
    for (const uid of userIds) {
      const { data: { user: u } } = await sb.auth.admin.getUserById(uid);
      if (u?.email) emailMap[uid] = u.email;
    }

    // 6. Snapshot hash — prova que a lista estava fechada antes do algoritmo
    const snapshotStr  = numeros.join("\n");
    const snapshotHash = await sha256hex(snapshotStr);

    // 7. Algoritmo — 1º lugar
    const { indice: i1, algoritmoInput: ai1, algoritmoHash: ah1 } =
      await executarAlgoritmo(btcHash, draw_id, 1, numeros.length);
    const numero1 = numeros[i1];
    const userId1 = numToUser.get(numero1);
    if (!userId1) return jsonResponse({ error: `Número selecionado (${numero1}) não possui participante` }, 500);

    // 8. Algoritmo — 2º lugar (exclui números do mesmo usuário)
    const numerosParaSegundo = numeros.filter(n => numToUser.get(n) !== userId1);
    let numero2: number | null = null;
    let userId2: string | null = null;
    let ai2: string | null = null;
    let ah2: string | null = null;

    if (numerosParaSegundo.length > 0) {
      const res2 = await executarAlgoritmo(btcHash, draw_id, 2, numerosParaSegundo.length);
      numero2  = numerosParaSegundo[res2.indice];
      userId2  = numToUser.get(numero2) || null;
      ai2      = res2.algoritmoInput;
      ah2      = res2.algoritmoHash;
    }

    // 9. Resultado
    const resultado = [
      {
        posicao:      1,
        user_id:      userId1,
        email_masked: maskEmail(emailMap[userId1] || ""),
        numero:       numero1,
      },
      ...(userId2 && numero2 ? [{
        posicao:      2,
        user_id:      userId2,
        email_masked: maskEmail(emailMap[userId2] || ""),
        numero:       numero2,
      }] : []),
    ];

    // 10. details JSONB — trilha de auditoria completa e reproduzível
    const details = {
      algoritmo:               "sha256-bigint-v1",
      bitcoin_block_hash:      btcHash,
      bitcoin_block_height:    bloco.height,
      bitcoin_block_timestamp: bloco.timestamp,
      bitcoin_confirmacoes:    confirmacoes,
      snapshot_count:          numeros.length,
      snapshot_hash:           snapshotHash,
      primeiro_lugar: {
        algoritmo_input: ai1,
        algoritmo_hash:  ah1,
        indice:          i1,
        numero:          numero1,
      },
      segundo_lugar: numero2 !== null ? {
        algoritmo_input: ai2,
        algoritmo_hash:  ah2,
        indice:          numerosParaSegundo.indexOf(numero2),
        numero:          numero2,
        pool_size:       numerosParaSegundo.length,
      } : null,
      resultado,
    };

    // Audit hash — SHA-256 do canonical JSON (imutável)
    const canonicalJson = JSON.stringify({ draw_id, seed: btcHash, ...details });
    const auditHash     = await sha256hex(canonicalJson);

    // 11. Persistir draw_audits (append-only)
    const { error: auditErr } = await sb.from("draw_audits").insert({
      draw_id,
      action:      "execute",
      seed:        btcHash,
      details:     { ...details, audit_hash: auditHash },
      executed_by: user.email ?? "system",
    });

    if (auditErr) {
      console.error("[draw_audits]", auditErr);
      return jsonResponse({ error: "Erro ao salvar auditoria: " + auditErr.message }, 500);
    }

    // 12. Atualizar draw
    await sb.from("draws").update({
      status:          "drawn",
      numero_sorteado: numero1,
    }).eq("id", draw_id);

    // 13. draw_winners
    const winners = [
      { draw_id, user_id: userId1, posicao: 1, cotas_total: (userNums.get(userId1) || []).length, premio: draw.premio_1 || null, nome_publico: maskEmail(emailMap[userId1] || "") },
      ...(userId2 ? [{ draw_id, user_id: userId2, posicao: 2, cotas_total: (userNums.get(userId2) || []).length, premio: draw.premio_2 || null, nome_publico: maskEmail(emailMap[userId2] || "") }] : []),
    ];
    await sb.from("draw_winners").insert(winners);

    // 14. Criar próxima rodada
    const numMatch  = (draw.titulo || "").match(/(\d+)/);
    const nextNum   = numMatch ? parseInt(numMatch[1]) + 1 : 2;
    const nextTit   = draw.titulo ? draw.titulo.replace(/\d+/, String(nextNum)) : `Rodada ${nextNum}`;
    await sb.from("draws").insert({
      titulo:      nextTit,
      status:      "open",
      premio_1:    draw.premio_1,
      premio_2:    draw.premio_2,
      meta_tipo:   draw.meta_tipo,
      meta_valor:  draw.meta_valor,
      meta_atual:  0,
      max_numeros: draw.max_numeros || 100000,
    });

    // 15. Emails
    if (emailMap[userId1] && draw.premio_1) {
      await enviarEmailVencedor(emailMap[userId1], 1, draw.premio_1, draw.titulo || "Premiação", draw_id, numero1);
    }
    if (userId2 && numero2 && emailMap[userId2] && draw.premio_2) {
      await enviarEmailVencedor(emailMap[userId2], 2, draw.premio_2, draw.titulo || "Premiação", draw_id, numero2);
    }

    return jsonResponse({
      success:                true,
      draw_id,
      algoritmo:              "sha256-bigint-v1",
      bitcoin_block_hash:     btcHash,
      bitcoin_block_height:   bloco.height,
      bitcoin_confirmacoes:   confirmacoes,
      snapshot_count:         numeros.length,
      snapshot_hash:          snapshotHash,
      audit_hash:             auditHash,
      numero_sorteado:        numero1,
      total_participantes:    userNums.size,
      resultado,
      proxima_rodada:         nextTit,
      auditoria_url:          `${SITE_URL}/auditoria-sorteio.html?draw_id=${draw_id}`,
    });

  } catch (err) {
    console.error("[execute-draw]", err);
    return jsonResponse({ error: "Erro interno: " + String(err) }, 500);
  }
});
