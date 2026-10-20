/**
 * admin-forge.ts — ponte do admin para o worker do tr3vo-forge.
 * O segredo do Forge (FORGE_API_SECRET) fica só no worker; o navegador nunca o vê.
 * Só passa o que está na lista fechada abaixo, e só com sessão de admin válida.
 */

import { z } from 'zod';
import type { Env } from '../types';
import { verificarToken } from './admin-catalog';

const FORGE_URL_PADRAO = 'https://tr3vo-forge.al-kbhal.workers.dev';
const PREFIXO = '/api/admin/forge/';
const UUID = /^[0-9a-f-]{36}$/i;
const MAX_BODY_BYTES = 5 * 1024 * 1024;

// A lista de formatos mora só no Forge (GET /formatos); aqui só se barra lixo e o Forge valida o resto.
const formatoSchema = z.string().regex(/^[a-z0-9-]{1,40}$/);

const ingerirSchema = z.object({
  manuscrito: z.string().min(200).max(4_000_000),
  titulo: z.string().trim().max(200).optional(),
  modo: z.enum(['completar', 'aprimorar', 'ambos']).optional(),
  metaPalavras: z.number().int().positive().max(1_000_000).optional(),
  formato: formatoSchema.optional(),
});
const novoSchema = z.object({
  tema: z.string().trim().min(3).max(500),
  contexto: z.string().max(5000).optional(),
  formato: formatoSchema.optional(),
});
const apagarSchema = z.object({ feedback: z.string().max(2000).optional() });

type Rota = { metodo: string; destino: (id: string) => string; id: boolean; corpo?: z.ZodTypeAny };

// ponytail: lista fechada, uma linha por ação do Forge; rota nova do Forge só entra aqui de propósito
const ROTAS: Record<string, Rota> = {
  'GET projetos': { metodo: 'GET', destino: () => '/projects?limit=50', id: false },
  'GET formatos': { metodo: 'GET', destino: () => '/formatos', id: false },
  'GET status': { metodo: 'GET', destino: (id) => `/status/${id}`, id: true },
  'GET custos': { metodo: 'GET', destino: (id) => `/costs/${id}`, id: true },
  'POST ingerir': { metodo: 'POST', destino: () => '/ingest', id: false, corpo: ingerirSchema },
  'POST novo': { metodo: 'POST', destino: () => '/', id: false, corpo: novoSchema },
  'POST retry': { metodo: 'POST', destino: (id) => `/retry/${id}`, id: true },
  'POST rerender': { metodo: 'POST', destino: (id) => `/rerender/${id}`, id: true },
  'DELETE projetos': { metodo: 'DELETE', destino: (id) => `/projects/${id}`, id: true, corpo: apagarSchema },
};

function json(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export async function handleAdminForge(request: Request, env: Env, path: string): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });

  const [acao, id = ''] = path.slice(PREFIXO.length).split('/');
  const rota = ROTAS[`${request.method} ${acao}`];
  if (!rota) return json({ ok: false, erro: 'rota_forge_desconhecida' }, 404);
  if (rota.id && !UUID.test(id)) return json({ ok: false, erro: 'id_invalido' }, 400);

  let corpo: string | undefined;
  if (rota.corpo) {
    if (parseInt(request.headers.get('content-length') ?? '0', 10) > MAX_BODY_BYTES) {
      return json({ ok: false, erro: 'payload_grande_demais' }, 413);
    }
    const bruto = await request.json().catch(() => ({}));
    const valido = rota.corpo.safeParse(bruto);
    if (!valido.success) return json({ ok: false, erro: 'corpo_invalido', detalhe: valido.error.issues[0]?.message }, 400);
    corpo = JSON.stringify(valido.data);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (env.FORGE_API_SECRET) headers['X-Forge-Secret'] = env.FORGE_API_SECRET;

  let r: Response;
  try {
    r = await fetch(`${env.FORGE_URL ?? FORGE_URL_PADRAO}${rota.destino(id)}`, {
      method: rota.metodo,
      headers,
      body: corpo,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    console.error('[forge] falha ao chamar o Forge:', e);
    const timeout = e instanceof Error && e.name === 'TimeoutError';
    return json({ ok: false, erro: timeout ? 'forge_timeout' : 'forge_indisponivel' }, timeout ? 504 : 502);
  }

  if (r.status === 401) return json({ ok: false, erro: 'forge_nao_autorizado' }, 502);
  const texto = await r.text();
  try {
    return json(JSON.parse(texto), r.status);
  } catch {
    return json({ ok: r.ok, resposta: texto.slice(0, 500) }, r.status);
  }
}
