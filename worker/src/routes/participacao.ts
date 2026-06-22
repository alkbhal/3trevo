/**
 * participacao.ts — Três Trevo Worker
 * Rotas do Programa Cultural
 *
 * POST /api/participacao/status?pedido_id=...    — estado da participação (pré-formulário)
 * POST /api/participacao/depoimento              — submissão + validação Haiku + crédito de cota
 * POST /api/participacao/questionario            — pesquisa anônima + multiplicador bônus
 *
 * Deploy: copiar para worker/src/routes/participacao.ts
 */

import type { Env } from '../types';

const ALLOWED_ORIGINS = ['https://3trevo.com.br', 'https://www.3trevo.com.br', 'http://localhost:5500', 'http://127.0.0.1:5500'];
function getCorsOrigin(request: Request): string {
  const origin = request.headers.get('Origin');
  return origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
}

// ─── Rate limiting simples via KV ─────────────────────────────────────────────
async function checkRateLimit(env: Env, key: string, maxPerHour = 5): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000);
  const window = Math.floor(now / 3600);
  const kvKey = `rl:${key}:${window}`;

  const raw = await env.TT_KV?.get(kvKey);
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= maxPerHour) return false;

  await env.TT_KV?.put(kvKey, String(count + 1), { expirationTtl: 7200 });
  return true;
}

// ─── Validação Camada 1 — regex local (sem custo) ────────────────────────────
interface ValidacaoLocal {
  ok: boolean;
  motivo?: string;
}

function validarCamada1(texto: string): ValidacaoLocal {
  const tamanho = texto.trim().length;
  if (tamanho < 40) return { ok: false, motivo: 'tamanho' };
  if (tamanho > 3000) return { ok: false, motivo: 'tamanho' };

  // Palavras proibidas (calão / discurso de ódio — lista mínima, ampliável em KV)
  const blocklist = [
    /\bmerda\b/i, /\bporra\b/i, /\bcuzão\b/i, /\bputa\b/i,
    /\bfoda\b/i, /\bviado\b/i, /\bvadia\b/i, /\bnegro\s+feio\b/i,
  ];
  for (const re of blocklist) {
    if (re.test(texto)) return { ok: false, motivo: 'calao' };
  }

  // Spam: repetição excessiva
  const palavras = texto.trim().split(/\s+/);
  const unicas = new Set(palavras.map((p) => p.toLowerCase()));
  if (unicas.size < palavras.length * 0.3) return { ok: false, motivo: 'spam' };

  return { ok: true };
}

// ─── Validação Camada 2 — Claude Haiku ───────────────────────────────────────
interface ValidacaoHaiku {
  decisao: 'aprovado' | 'revisao_manual' | 'reprovado_conteudo';
  confianca: number;
  motivo?: string;
}

async function validarCamada2Haiku(
  env: Env,
  texto: string,
  ebook_titulo: string
): Promise<ValidacaoHaiku> {
  if (!env.ANTHROPIC_KEY) {
    // Sem chave → revisão manual conservadora
    return { decisao: 'revisao_manual', confianca: 0.5 };
  }

  const prompt = `Você é um moderador de depoimentos para o Programa Cultural da Editora Três Trevo.
Avalie se o depoimento abaixo demonstra leitura genuína do ebook "${ebook_titulo}".

DEPOIMENTO:
"""
${texto}
"""

Responda em JSON com exatamente este formato:
{
  "decisao": "aprovado" | "revisao_manual" | "reprovado_conteudo",
  "confianca": 0.0-1.0,
  "motivo": "string curta opcional"
}

Critérios:
- "aprovado": texto específico, menciona conteúdo do livro, opiniões reais, ≥ 2 ideias distintas
- "revisao_manual": genérico mas sem problemas, ou tem conteúdo suspeito porém não óbvio
- "reprovado_conteudo": claramente spam, copiado de outra fonte, sem relação com o livro, conspiração, ódio`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = (await resp.json()) as any;
    const raw = data?.content?.[0]?.text ?? '';
    const parsed = JSON.parse(raw.match(/\{[\s\S]+\}/)?.[0] ?? '{}');

    return {
      decisao: parsed.decisao ?? 'revisao_manual',
      confianca: parsed.confianca ?? 0.5,
      motivo: parsed.motivo,
    };
  } catch {
    return { decisao: 'revisao_manual', confianca: 0.3 };
  }
}

// ─── Handler: GET /api/participacao/status ────────────────────────────────────
export async function handleParticipacaoStatus(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'GET') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const pedido_id = url.searchParams.get('pedido_id');

  if (!pedido_id) {
    return Response.json({ ok: false, erro: 'pedido_id obrigatório' }, { status: 400 });
  }

  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consultar_participacao`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_pedido_id: pedido_id }),
  });

  const data = await resp.json();
  return Response.json(data, {
    headers: { 'Access-Control-Allow-Origin': getCorsOrigin(request) },
  });
}

// ─── Handler: POST /api/participacao/depoimento ──────────────────────────────
export async function handleDepoimento(request: Request, env: Env): Promise<Response> {
  const corsHeaders = { 'Access-Control-Allow-Origin': getCorsOrigin(request) };

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  let body: { pedido_id: string; texto: string; nome_autor?: string } | null = null;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, erro: 'JSON inválido' }, { status: 400 });
  }

  const { pedido_id, texto, nome_autor } = body ?? {};
  if (!pedido_id || !texto) {
    return Response.json({ ok: false, erro: 'pedido_id e texto são obrigatórios' }, { status: 400 });
  }

  // Rate limiting por pedido_id
  const allowed = await checkRateLimit(env, `dep:${pedido_id}`, 3);
  if (!allowed) {
    return Response.json({ ok: false, erro: 'limite_tentativas' }, { status: 429, headers: corsHeaders });
  }

  // Buscar dados do pedido para validação contextual
  const statusResp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consultar_participacao`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_pedido_id: pedido_id }),
  });
  const status = (await statusResp.json()) as any;

  if (!status.ok) {
    return Response.json({ ok: false, erro: status.erro }, { status: 404, headers: corsHeaders });
  }

  if (!status.liberado) {
    return Response.json(
      { ok: false, erro: 'participacao_nao_liberada', dias_passados: status.dias_passados },
      { status: 403, headers: corsHeaders }
    );
  }

  if (status.depoimento?.estado === 'aprovado') {
    return Response.json({ ok: false, erro: 'depoimento_ja_aprovado' }, { status: 409, headers: corsHeaders });
  }

  // Camada 1 — validação local
  const v1 = validarCamada1(texto);
  if (!v1.ok) {
    let estado = 'reprovado_calao';
    if (v1.motivo === 'spam') estado = 'reprovado_conteudo';
    if (v1.motivo === 'tamanho') {
      return Response.json(
        { ok: false, erro: 'texto_curto', minimo: 40 },
        { status: 400, headers: corsHeaders }
      );
    }

    // Gravar e retornar reprovado
    await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/submit_depoimento`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_pedido_id: pedido_id,
        p_texto: texto.slice(0, 3000),
        p_nome_autor: nome_autor ?? 'Anônimo',
        p_estado: estado,
        p_motivo_reprovacao: v1.motivo,
        p_confianca: 1.0,
      }),
    });

    return Response.json({ ok: false, estado, motivo: v1.motivo }, { headers: corsHeaders });
  }

  // Camada 2 — Haiku
  const v2 = await validarCamada2Haiku(env, texto, status.ebook_titulo ?? 'ebook');

  // Persistir resultado
  const submitResp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/submit_depoimento`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_pedido_id: pedido_id,
      p_texto: texto.slice(0, 3000),
      p_nome_autor: nome_autor ?? 'Anônimo',
      p_estado: v2.decisao,
      p_motivo_reprovacao: v2.motivo ?? null,
      p_confianca: v2.confianca,
    }),
  });
  const result = (await submitResp.json()) as any;

  // Notificar Dias se entrou em revisao_manual
  if (v2.decisao === 'revisao_manual' && env.RESEND_API_KEY) {
    await notificarRevisaoManual(env, { pedido_id, ebook_titulo: status.ebook_titulo }).catch(() => {});
  }

  return Response.json(
    { ok: result.ok, estado: v2.decisao, dep_id: result.dep_id },
    { headers: corsHeaders }
  );
}

// ─── Handler: POST /api/participacao/questionario ────────────────────────────
export async function handleQuestionario(request: Request, env: Env): Promise<Response> {
  const corsHeaders = { 'Access-Control-Allow-Origin': getCorsOrigin(request) };

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: { ...corsHeaders, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }

  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'JSON inválido' }, { status: 400 }); }

  const { pedido_id, categoria_premio, respostas, consentimento_lgpd } = body ?? {};
  if (!pedido_id || !respostas) {
    return Response.json({ ok: false, erro: 'pedido_id e respostas são obrigatórios' }, { status: 400 });
  }

  const resp = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/creditar_questionario`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_pedido_id: pedido_id,
      p_categoria_premio: categoria_premio ?? 'geral',
      p_respostas: respostas,
      p_consentimento: consentimento_lgpd ?? false,
    }),
  });

  const data = await resp.json();
  return Response.json(data, { headers: corsHeaders });
}

// ─── Notificação de revisão manual para Dias ─────────────────────────────────
async function notificarRevisaoManual(
  env: Env,
  ctx: { pedido_id: string; ebook_titulo: string }
): Promise<void> {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'sistema@3trevo.com.br',
      to: 'rogerio.kbhal@gmail.com',
      subject: `[Três Trevo] Depoimento aguarda revisão — ${ctx.ebook_titulo}`,
      html: `<p>Um depoimento do ebook <strong>${ctx.ebook_titulo}</strong> entrou na fila de revisão manual.</p>
<p>Pedido: <code>${ctx.pedido_id}</code></p>
<p><a href="https://3trevo.com.br/admin.html#moderacao">Abrir painel de moderação →</a></p>`,
    }),
  });
}
