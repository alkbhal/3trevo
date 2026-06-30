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
  handleCriarPreferencia,
  handleWebhookPagamento,
  handleDownload,
} from './routes/checkout';
import {
  handleFilaRevisao,
  handleModerar,
} from './routes/apuracao';
import { handleSorteio } from './routes/sorteio';
import { handleAdminUploadCapa, handleAdminUploadEpub, handleAdminUploadVideo, handlePublicCapa, handlePublicVideo } from './routes/admin-upload';
import {
  verificarToken,
  handleAdminCatalogoGet,
  handleAdminCatalogoCreate,
  handleAdminCatalogoUpdate,
  handleAdminCatalogoDelete,
  handleAdminProductsSync,
  handleAdminCatalogoPatch,
  handleAdminTableInsert,
} from './routes/admin-catalog';
import {
  handleHeroConfigGet,
  handleHeroConfigPut,
} from './routes/admin-hero';
import { handleAiStudio } from './routes/admin-ai-studio';
import { handleAdminLogin, handleAdminStats } from './routes/admin-auth';
import { handleTrack, handleMetaCapi } from './routes/track';
import { handleLeadCapture, handleUnsubscribe } from './routes/leads';
import { handleAdminMarketingStats } from './routes/admin-marketing';
import { handleAdminBI } from './routes/admin-bi';
import { handleBudgetController } from './cron/budget-controller';
import { handleEmailEngine } from './cron/email-engine';
import {
  handleAdminDepoimentosList,
  handleAdminDepoimentoUpdate,
} from './routes/admin-depoimentos-ext';
import {
  handleHealthBasic,
  handleHealthStatus,
  handleAdminHealth,
  handleAdminHealthLog,
  logError,
  registrarFalhaLogin,
  registrarFalhaHMAC,
} from './routes/health';
import { handleHealthMonitor } from './cron/health-monitor';
import {
  handleBibliotecaAcervo,
  handleBibliotecaAcesso,
  handleBibliotecaVerificar,
  handleBibliotecaStream,
  handleBibliotecaMinha,
  handleBibliotecaSelecionar,
  handleBibliotecaMarcarLida,
  handleBibliotecaProgresso,
  handleBibliotecaLer,
  handleAdminBibliotecaAcervoGet,
  handleAdminBibliotecaAcervoCreate,
  handleAdminBibliotecaAcervoUpdate,
  handleAdminBibliotecaAcervoDelete,
  handleAdminBibliotecaStats,
} from './routes/biblioteca';

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
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// ─── Roteador principal ───────────────────────────────────────────────────────
// ─── CORS wrapper — aplicado a TODAS as respostas ───────────────────────────
function withCors(response: Response, origin: string | null): Response {
  const headers = new Headers(response.headers);
  const cors = corsHeaders(origin) as Record<string, string>;
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}

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

    // Todas as respostas passam por withCors + global error handler
    try {
      return withCors(await dispatch(request, env, path, method, origin), origin);
    } catch (err) {
      console.error('[worker] erro não capturado:', err);
      return withCors(
        Response.json({ ok: false, erro: 'internal_error' }, { status: 500 }),
        origin
      );
    }
  },

  // Cron triggers
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log(`[cron] disparado: ${event.cron}`);
    // Health monitor — toda hora
    if (event.cron === '0 * * * *') {
      ctx.waitUntil(handleHealthMonitor(env));
      ctx.waitUntil(handleEmailEngine(env));
      ctx.waitUntil(handleBudgetController(env));
    }
  },
};

// ─── Roteador ─────────────────────────────────────────────────────────────────
async function dispatch(request: Request, env: Env, path: string, method: string, origin: string | null): Promise<Response> {
    // ── Rotas públicas ─────────────────────────────────────────────────────
    if (path === '/health' || path === '/') {
      return handleHealthBasic();
    }

    if (path === '/api/health/status' && method === 'GET') {
      return handleHealthStatus(env);
    }

    // Hero config pública (sem auth — leitura do KV para o frontend)
    if (path === '/api/hero-public' && method === 'GET') {
      if (!env.TT_KV) return new Response('{}', { headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
      const raw = await env.TT_KV.get('site:hero-config');
      return new Response(raw || '{}', {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60', ...corsHeaders(origin) },
      });
    }

    // ── Growth Engine: tracking + leads (público) ────────────────────────
    if (path === '/api/track' && method === 'POST') return handleTrack(request, env);
    if (path === '/api/track/capi' && method === 'POST') return handleMetaCapi(request, env);
    if (path === '/api/leads/capture' && method === 'POST') return handleLeadCapture(request, env);
    if (path === '/api/leads/unsub' && method === 'GET') return handleUnsubscribe(request, env);

    // Depoimentos públicos (aprovados — para o site)
    if (path === '/api/public/depoimentos' && method === 'GET') {
      const r = await fetch(
        `${env.SUPABASE_URL}/rest/v1/depoimentos?estado=eq.aprovado&order=aprovado_em.desc&limit=20&select=id,texto,nome,slug`,
        { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
      );
      const data = await r.json();
      return new Response(JSON.stringify(data), {
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=120', ...corsHeaders(origin) },
      });
    }

    // Catálogo (leitura pública)
    if (path === '/api/public/catalogo' && method === 'GET') {
      const resp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/catalogo?ativo=eq.true&order=ordem.asc&select=slug,titulo,titulo_en,titulo_es,descricao,descricao_en,descricao_es,genero,genero_pt,genero_en,genero_es,autor,preco,cotas,utm_campaign,bg_color,capa_url,ordem`,
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

    // ── Checkout / Pagamento ──────────────────────────────────────────────
    if (path === '/api/checkout/preferencia' && (method === 'POST' || method === 'OPTIONS')) {
      return handleCriarPreferencia(request, env);
    }

    if (path === '/api/webhook/pagamento' && (method === 'POST' || method === 'GET')) {
      return handleWebhookPagamento(request, env);
    }

    // ── Download de ebook ──────────────────────────────────────────────────
    if (path === '/api/download' && method === 'GET') {
      return handleDownload(request, env);
    }

    // ── Admin ──────────────────────────────────────────────────────────────
    if (path === '/api/admin/sorteio' && method === 'POST') {
      return handleSorteio(request, env);
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

    // ── Uploads (admin) ─────────────────────────────────────────────────────
    if (path === '/api/admin/upload/capa' && method === 'POST') {
      return handleAdminUploadCapa(request, env);
    }
    if (path === '/api/admin/upload/epub' && method === 'POST') {
      return handleAdminUploadEpub(request, env);
    }
    if (path === '/api/admin/upload/video' && method === 'POST') {
      return handleAdminUploadVideo(request, env);
    }

    // ── Serve arquivos públicos (sem auth, cache) ─────────────────────────
    if (path.startsWith('/api/public/capas/') && method === 'GET') {
      const filename = path.replace('/api/public/capas/', '');
      return handlePublicCapa(request, env, filename);
    }
    if (path.startsWith('/api/public/videos/') && method === 'GET') {
      const filename = path.replace('/api/public/videos/', '');
      return handlePublicVideo(request, env, filename);
    }

    // ── Admin Catálogo ─────────────────────────────────────────────────────
    if (path === '/api/admin/catalogo' && method === 'GET') {
      return handleAdminCatalogoGet(request, env);
    }
    if (path === '/api/admin/catalogo' && method === 'POST') {
      return handleAdminCatalogoCreate(request, env);
    }
    if (path.startsWith('/api/admin/catalogo/') && method === 'PUT') {
      const slug = path.replace('/api/admin/catalogo/', '');
      return handleAdminCatalogoUpdate(request, env, slug);
    }
    if (path.startsWith('/api/admin/catalogo/') && method === 'DELETE') {
      const slug = path.replace('/api/admin/catalogo/', '');
      return handleAdminCatalogoDelete(request, env, slug);
    }

    if (path === '/api/admin/products/sync' && method === 'POST') {
      return handleAdminProductsSync(request, env);
    }
    if (path === '/api/admin/catalogo/patch' && method === 'POST') {
      return handleAdminCatalogoPatch(request, env);
    }
    if (path === '/api/admin/table/insert' && method === 'POST') {
      return handleAdminTableInsert(request, env);
    }

    // ── Admin Hero Config ──────────────────────────────────────────────────
    if (path === '/api/admin/hero-config' && method === 'GET') {
      return handleHeroConfigGet(request, env);
    }
    if (path === '/api/admin/hero-config' && method === 'PUT') {
      return handleHeroConfigPut(request, env);
    }

    // ── Admin Marketing (Growth Engine) ──────────────────────────────────
    if (path === '/api/admin/marketing/stats' && method === 'GET') {
      return handleAdminMarketingStats(request, env);
    }

    // ── Admin BI ──────────────────────────────────────────────────────────
    if (path === '/api/admin/bi' && method === 'GET') {
      return handleAdminBI(request, env);
    }

    // ── Admin IA Studio ────────────────────────────────────────────────────
    if (path === '/api/admin/ai-studio' && method === 'POST') {
      return handleAiStudio(request, env);
    }

    // ── Admin Depoimentos extendidos ───────────────────────────────────────
    if (path === '/api/admin/depoimentos' && method === 'GET') {
      return handleAdminDepoimentosList(request, env);
    }
    if (path.startsWith('/api/admin/depoimentos/') && method === 'PATCH') {
      const id = path.replace('/api/admin/depoimentos/', '');
      return handleAdminDepoimentoUpdate(request, env, id);
    }

    // ── Biblioteca TT — públicas ───────────────────────────────────────────
    if (path === '/api/biblioteca/acervo' && method === 'GET') {
      return handleBibliotecaAcervo(request, env);
    }
    if (path === '/api/biblioteca/acesso' && method === 'POST') {
      return handleBibliotecaAcesso(request, env);
    }
    if (path === '/api/biblioteca/verificar' && method === 'GET') {
      return handleBibliotecaVerificar(request, env);
    }
    if (path === '/api/biblioteca/stream' && method === 'GET') {
      return handleBibliotecaStream(request, env);
    }

    // ── Biblioteca TT — autenticadas (leitor) ──────────────────────────────
    if (path === '/api/biblioteca/minha' && method === 'GET') {
      return handleBibliotecaMinha(request, env);
    }
    if (path === '/api/biblioteca/selecionar' && method === 'POST') {
      return handleBibliotecaSelecionar(request, env);
    }
    if (path === '/api/biblioteca/marcar-lida' && method === 'POST') {
      return handleBibliotecaMarcarLida(request, env);
    }
    if (path === '/api/biblioteca/progresso' && method === 'POST') {
      return handleBibliotecaProgresso(request, env);
    }
    if (path === '/api/biblioteca/ler' && method === 'POST') {
      return handleBibliotecaLer(request, env);
    }

    // ── Admin Biblioteca ───────────────────────────────────────────────────
    if (path === '/api/admin/biblioteca/acervo' && method === 'GET') {
      return handleAdminBibliotecaAcervoGet(request, env);
    }
    if (path === '/api/admin/biblioteca/acervo' && method === 'POST') {
      return handleAdminBibliotecaAcervoCreate(request, env);
    }
    if (path.startsWith('/api/admin/biblioteca/acervo/') && method === 'PUT') {
      const slug = path.replace('/api/admin/biblioteca/acervo/', '');
      return handleAdminBibliotecaAcervoUpdate(request, env, slug);
    }
    if (path.startsWith('/api/admin/biblioteca/acervo/') && method === 'DELETE') {
      const slug = path.replace('/api/admin/biblioteca/acervo/', '');
      return handleAdminBibliotecaAcervoDelete(request, env, slug);
    }
    if (path === '/api/admin/biblioteca/stats' && method === 'GET') {
      return handleAdminBibliotecaStats(request, env);
    }

    // ── 404 ────────────────────────────────────────────────────────────────
    // ── Admin Health ───────────────────────────────────────────────────────
    if (path === '/api/admin/health' && method === 'GET') {
      return handleAdminHealth(request, env);
    }
    if (path === '/api/admin/health/log' && method === 'GET') {
      return handleAdminHealthLog(request, env);
    }

    return json({ ok: false, erro: 'rota_nao_encontrada', path }, 404);
}

