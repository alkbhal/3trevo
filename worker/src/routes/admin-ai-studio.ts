/**
 * admin-ai-studio.ts — Três Trevo Worker
 * Agente Editorial IA — Claude Haiku como orquestrador de conteúdo
 *
 * POST /api/admin/ai-studio
 * Body: { instrucao: string, contexto: 'geral'|'catalogo'|'hero'|'depoimentos' }
 *
 * Fluxo:
 * 1. Busca dados relevantes do Supabase/KV conforme contexto
 * 2. Envia para Claude Haiku com sistema de prompt especializado
 * 3. Haiku retorna: { resposta: string, acao?: { tipo, payload } }
 * 4. Admin decide se confirma ou ignora a ação
 *
 * Ações suportadas (exigem confirmação humana):
 * - update_hero     → PUT /api/admin/hero-config
 * - update_catalogo → PUT /api/admin/catalogo/:slug
 * - aprovar_depoimento → POST /api/admin/moderar { acao: 'aprovar' }
 * - rejeitar_depoimento → POST /api/admin/moderar { acao: 'rejeitar' }
 */

import type { Env } from '../types';
import { verificarToken } from './admin-catalog';

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

// ─── Sistema de prompt por contexto ──────────────────────────────────────────
function buildSystemPrompt(contexto: string): string {
  const base = `Você é o Agente Editorial da Editora Três Trevo — uma editora digital independente de Montauri/RS.
Sua função: analisar dados do site e sugerir ações concretas e inteligentes.

REGRAS INVIOLÁVEIS:
- O único autor público é "Said Anes" — nunca cite outros nomes de autores.
- Nunca mencione "Loteria Federal" ou qualquer concorrente. O sistema interno é "Sistema Loteria TT".
- Nunca mencione "Rifei" ou qualquer plataforma de terceiros.
- Preços e métricas financeiras são confidenciais — não os publique em texto público.
- Respostas em português do Brasil. Tom: editorial, conciso, profissional.

FORMATO DE RESPOSTA:
Responda com análise clara. Se sugerir uma ação executável no site, inclua ao final um bloco JSON exatamente neste formato:

\`\`\`json
{
  "tipo": "update_hero" | "update_catalogo" | "aprovar_depoimento" | "rejeitar_depoimento" | "nenhuma",
  "payload": { ... dados para a ação ... }
}
\`\`\`

Se não houver ação concreta para executar, omita o bloco JSON.`;

  const extras: Record<string, string> = {
    catalogo: '\n\nFoco atual: CATÁLOGO — analise preços, ordem, descrições e cotas. Pense em conversão e destaque editorial.',
    hero: '\n\nFoco atual: HERO — analise qual livro deve estar em destaque, o vídeo e a ordem do carousel. Pense em impacto visual e conversão da primeira dobra.',
    depoimentos: '\n\nFoco atual: DEPOIMENTOS — analise qualidade, autenticidade e padrões. Identifique depoimentos que devem ser aprovados, rejeitados ou precisam de atenção.',
    geral: '\n\nFoco atual: VISÃO GERAL — analise o estado completo do site e sugira a ação de maior impacto neste momento.',
    marketing: `\n\nFoco atual: MARKETING / GROWTH ENGINE — você tem acesso a métricas de leads, eventos de tracking e catálogo.\n\nREGRAS DE COMUNICAÇÃO DA TRÊS TREVO:\n- Fórmula: "Compre, leia, concorra." — NUNCA mencionar "cotas", "SHA-256", "hash" em copy público.\n- Livro âncora: "O Nascimento Silencioso da 3ª Guerra Mundial" (slug: 3a-guerra).\n- Autor público: "Said Anes" (nunca citar nome real).\n- Preços confidenciais — use "a partir de R$15,35" em copy externo.\n- Tom: provocativo, intelectual, direto. Evitar excesso de emojis.\n- Hashtags fixas: #3trevo #editoratrestrevo #ebookbrasileiro #literaturaindependente\n\nQUANDO GERAR COPY, inclua bloco JSON ao final:\n\`\`\`json\n{\n  "tipo": "copy_pronto",\n  "payload": {\n    "formato": "post_instagram" | "reels_caption" | "meta_ads" | "email" | "whatsapp",\n    "titulo": "...",\n    "corpo": "...",\n    "cta": "...",\n    "hashtags": ["..."]\n  }\n}\n\`\`\``,
  };

  return base + (extras[contexto] ?? extras.geral);
}

// ─── Buscar dados contextuais ──────────────────────────────────────────────────
async function fetchContextData(env: Env, contexto: string): Promise<string> {
  const sb = (path: string) => fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
  });

  const sections: string[] = [];

  try {
    if (contexto === 'geral' || contexto === 'catalogo') {
      const r = await sb('catalogo?order=ordem.asc&select=slug,titulo,descricao,preco,cotas,ativo,ordem');
      const livros = await r.json() as any[];
      sections.push(`## Catálogo atual\n${JSON.stringify(livros, null, 2)}`);
    }

    if (contexto === 'geral' || contexto === 'depoimentos') {
      const [filaR, aprovR] = await Promise.all([
        sb('depoimentos?estado=eq.revisao_manual&select=id,texto,slug&limit=10'),
        sb('depoimentos?estado=eq.aprovado&select=id,texto,slug&limit=10&order=created_at.desc'),
      ]);
      const fila = await filaR.json() as any[];
      const aprov = await aprovR.json() as any[];
      sections.push(`## Depoimentos em fila de revisão (${fila.length})\n${JSON.stringify(fila, null, 2)}`);
      sections.push(`## Depoimentos aprovados recentes (${aprov.length})\n${JSON.stringify(aprov, null, 2)}`);
    }

    if (contexto === 'geral' || contexto === 'hero') {
      if (env.TT_KV) {
        const raw = await env.TT_KV.get('site:hero-config');
        if (raw) sections.push(`## Configuração atual do hero\n${raw}`);
      }
    }

    if (contexto === 'geral') {
      const [pedR, entrR] = await Promise.all([
        sb('pedidos?select=count'),
        sb('draw_entries?select=count'),
      ]);
      const pedCount = pedR.headers.get('Content-Range')?.split('/')[1] ?? '?';
      const entrCount = entrR.headers.get('Content-Range')?.split('/')[1] ?? '?';
      sections.push(`## Stats gerais\n- Total pedidos: ${pedCount}\n- Total cotas: ${entrCount}`);
    }

    if (contexto === 'marketing') {
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const authHdr = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` };
      const [leadsR, leadsWeekR, eventsR, catR] = await Promise.all([
        fetch(`${env.SUPABASE_URL}/rest/v1/leads?select=count`, {
          headers: { ...authHdr, Prefer: 'count=exact', Range: '0-0' } as any,
        }),
        fetch(`${env.SUPABASE_URL}/rest/v1/leads?created_at=gte.${weekAgo}&select=count`, {
          headers: { ...authHdr, Prefer: 'count=exact', Range: '0-0' } as any,
        }),
        fetch(`${env.SUPABASE_URL}/rest/v1/lead_events?select=event_type&order=created_at.desc&limit=200`, {
          headers: authHdr,
        }),
        sb('catalogo?order=ordem.asc&select=slug,titulo,preco,cotas,ativo'),
      ]);
      const totalLeads = leadsR.headers.get('Content-Range')?.split('/')[1] ?? '?';
      const leadsWeek = leadsWeekR.headers.get('Content-Range')?.split('/')[1] ?? '?';
      const eventsRaw = await eventsR.json() as any[];
      const evtCount: Record<string, number> = {};
      for (const e of eventsRaw) evtCount[e.event_type] = (evtCount[e.event_type] || 0) + 1;
      const catalogo = await catR.json() as any[];
      sections.push(`## Métricas de leads\n- Total de leads: ${totalLeads}\n- Leads nos últimos 7 dias: ${leadsWeek}\n- Breakdown de eventos: ${JSON.stringify(evtCount)}`);
      sections.push(`## Catálogo (para referência de copy)\n${JSON.stringify(catalogo.filter((l: any) => l.ativo), null, 2)}`);
    }
  } catch(e) {
    sections.push(`## Erro ao buscar dados\n${String(e)}`);
  }

  return sections.join('\n\n');
}

// ─── Extrair ação do JSON da resposta ─────────────────────────────────────────
function extrairAcao(resposta: string): { tipo: string; payload: any } | null {
  const match = resposta.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[1].trim());
    if (!obj.tipo || obj.tipo === 'nenhuma') return null;
    return obj;
  } catch { return null; }
}

function limparResposta(resposta: string): string {
  return resposta.replace(/```json[\s\S]*?```/g, '').trim();
}

// ─── Handler principal ────────────────────────────────────────────────────────
export async function handleAiStudio(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }

  const instrucao = String(body.instrucao ?? '').trim();
  const contexto = String(body.contexto ?? 'geral');
  if (!instrucao) return Response.json({ ok: false, erro: 'instrucao_vazia' }, { status: 400 });

  // Buscar dados contextuais
  const dadosCtx = await fetchContextData(env, contexto);

  // Montar mensagens
  const messages = [
    {
      role: 'user',
      content: `${instrucao}\n\n---\nDADOS DO SITE:\n${dadosCtx}`,
    },
  ];

  // Chamar Claude Haiku
  let haiku_resp: any;
  try {
    const r = await fetch(ANTHROPIC_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(contexto),
        messages,
      }),
    });
    haiku_resp = await r.json();
  } catch(e) {
    return Response.json({ ok: false, erro: 'anthropic_unreachable' }, { status: 503 });
  }

  if (haiku_resp.error) {
    return Response.json({ ok: false, erro: haiku_resp.error.message }, { status: 502 });
  }

  const texto = haiku_resp.content?.[0]?.text ?? '';
  const acao = extrairAcao(texto);
  const resposta = limparResposta(texto);

  return Response.json({ ok: true, resposta, acao });
}
