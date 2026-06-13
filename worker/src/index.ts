/**
 * index.ts — Três Trevo Worker
 * Ponto de entrada — roteamento completo
 *
 * Deploy: substituir worker/src/index.ts
 * Wrangler: npx wrangler deploy (de dentro de worker/)
 */

import type { Env } from './types';
import {
  handleParticipacaoStatus,
  handleDepoimento,
  handleQuestionario,
} from './routes/participacao';
import {
  handleWebhookPagamento,
  handleDownload,
} from './routes/checkout';
import {
  handleApuracao,
  handleFilaRevisao,
  handleModerar,
} from './routes/apuracao';
import { handleCronLF } from './cron/lf-apuracao';

// ─── CORS helper ──────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://3trevo.com.br',
  'https://www.3trevo.com.br',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin),
    },
  });
}

// ─── Roteador principal ───────────────────────────────────────────────────────
export default {
  // Requisições HTTP
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const origin = request.headers.get('Origin');

    // OPTIONS pre-flight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // ── Rotas públicas ─────────────────────────────────────────────────────
    if (path === '/health' || path === '/') {
      return json({ ok: true, version: '2.0.0', ts: new Date().toISOString() });
    }

    // Catálogo (leitura pública)
    if (path === '/api/public/catalogo' && method === 'GET') {
      const resp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/catalogo?ativo=eq.true&order=ordem.asc&select=slug,titulo,titulo_en,titulo_es,descricao,descricao_en,descricao_es,genero,genero_pt,genero_en,genero_es,autor,preco,cotas,utm_campaign,bg_color,ordem`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          },
        }
      );
      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300',
          ...corsHeaders(origin),
        },
      });
    }

    // ── Participação Cultural ──────────────────────────────────────────────
    if (path === '/api/participacao/status') {
      return handleParticipacaoStatus(request, env);
    }

    if (path === '/api/participacao/depoimento' && (method === 'POST' || method === 'OPTIONS')) {
      return handleDepoimento(request, env);
    }

    if (path === '/api/participacao/questionario' && (method === 'POST' || method === 'OPTIONS')) {
      return handleQuestionario(request, env);
    }

    // ── Webhook de pagamento ───────────────────────────────────────────────
    if (path === '/api/webhook/pagamento' && method === 'POST') {
      return handleWebhookPagamento(request, env);
    }

    // ── Download de ebook ──────────────────────────────────────────────────
    if (path === '/api/download' && method === 'GET') {
      return handleDownload(request, env);
    }

    // ── Admin ──────────────────────────────────────────────────────────────
    if (path === '/api/admin/apuracao' && method === 'POST') {
      return handleApuracao(request, env);
    }

    if (path === '/api/admin/fila' && method === 'GET') {
      return handleFilaRevisao(request, env);
    }

    if (path === '/api/admin/moderar' && method === 'POST') {
      return handleModerar(request, env);
    }

    // Login admin (geração de sessão)
    if (path === '/api/admin/login' && method === 'POST') {
      return handleAdminLogin(request, env);
    }

    // Stats (admin)
    if (path === '/api/admin/stats' && method === 'GET') {
      return handleAdminStats(request, env);
    }

    // ── 404 ────────────────────────────────────────────────────────────────
    return json({ ok: false, erro: 'rota_nao_encontrada', path }, 404, origin);
  },

  // Cron triggers
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[cron] disparado: ${event.cron}`);
    // "0 23 * * 5" = sextas às 23:00 UTC (20:00 BRT)
    if (event.cron === '0 23 * * 5') {
      ctx.waitUntil(handleCronLF(env));
    }
  },
};

// ─── Admin Login ──────────────────────────────────────────────────────────────
async function handleAdminLogin(request: Request, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return new Response('Bad Request', { status: 400 }); }

  const { pin } = body ?? {};
  if (!pin) return Response.json({ ok: false }, { status: 400 });

  const pinHash = await sha256(pin);

  // Verificar usuário
  const userResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/dash_usuarios?pin_hash=eq.${pinHash}&select=id`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const users = (await userResp.json()) as any[];
  if (!users.length) return Response.json({ ok: false, erro: 'pin_invalido' }, { status: 401 });

  // Criar sessão
  const sessaoResp = await fetch(`${env.SUPABASE_URL}/rest/v1/admin_sessoes`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ ip: request.headers.get('CF-Connecting-IP') }),
  });
  const [sessao] = (await sessaoResp.json()) as any[];

  return Response.json({ ok: true, token: sessao.token, expira_em: sessao.expira_em });
}

// ─── Admin Stats ──────────────────────────────────────────────────────────────
async function handleAdminStats(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.replace('Bearer ', '').trim();

  // Verificar sessão
  const sessaoResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/admin_sessoes?token=eq.${encodeURIComponent(token)}&ativa=eq.true&select=expira_em`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const sessoes = (await sessaoResp.json()) as any[];
  if (!sessoes.length || new Date(sessoes[0].expira_em) < new Date()) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Buscar stats em paralelo
  const [pedidosR, entriesR, depR, drawsR, filaR] = await Promise.all([
    fetch(`${env.SUPABASE_URL}/rest/v1/pedidos?select=count`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, Prefer: 'count=exact', Range: '0-0' },
    }),
    fetch(`${env.SUPABASE_URL}/rest/v1/draw_entries?select=count`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, Prefer: 'count=exact', Range: '0-0' },
    }),
    fetch(`${env.SUPABASE_URL}/rest/v1/depoimentos?estado=eq.aprovado&select=count`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, Prefer: 'count=exact', Range: '0-0' },
    }),
    fetch(`${env.SUPABASE_URL}/rest/v1/draws?status=eq.open&select=id,titulo,status`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
    }),
    fetch(`${env.SUPABASE_URL}/rest/v1/depoimentos?estado=eq.revisao_manual&select=count`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, Prefer: 'count=exact', Range: '0-0' },
    }),
  ]);

  const parseCount = (r: Response) => parseInt(r.headers.get('Content-Range')?.split('/')[1] ?? '0', 10);
  const draws = (await drawsR.json()) as any[];

  return Response.json({
    ok: true,
    total_pedidos: parseCount(pedidosR),
    total_entries: parseCount(entriesR),
    depoimentos_aprovados: parseCount(depR),
    revisao_pendente: parseCount(filaR),
    draw_ativo: draws[0] ?? null,
    ts: new Date().toISOString(),
  });
}

// ─── SHA-256 helper ────────────────────────────────────────────────────────────
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
