/**
 * admin-producao.ts — o admin comanda a esteira de produção (scripts Python no GitHub Actions
 * do tr3vo-forge: "Compor obra" e "Narrar obra").
 *
 * GET  /api/admin/producao/obras               — obras cadastradas em scripts/obras/obras.json
 * GET  /api/admin/producao/execucoes?slug=X    — últimas execuções dos dois workflows
 * POST /api/admin/producao/disparar            — { slug, etapa: compor|narrar, publicar, capitulos? }
 *
 * O token do GitHub (GH_PRODUCAO_TOKEN) fica só no worker. Ele deve ser fine-grained, restrito ao
 * tr3vo-forge, com Actions read/write e Contents read: o pior que vaza é disparar uma composição.
 * A sessão de admin já foi conferida pelo portão do roteador; o handler confere de novo.
 */

import { z } from 'zod';
import type { Env } from '../types';
import { verificarToken } from './admin-catalog';

const REPO_PADRAO = 'alkbhal/tr3vo-forge';
const PREFIXO = '/api/admin/producao/';
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Etapa → arquivo do workflow. Lista fechada: só estes dois podem ser disparados daqui.
export const WORKFLOWS = {
  compor: 'compor-obra.yml',
  narrar: 'narrar-obra.yml',
} as const;
type Etapa = keyof typeof WORKFLOWS;

const dispararSchema = z.object({
  slug: z.string().regex(SLUG).max(80),
  etapa: z.enum(['compor', 'narrar']),
  publicar: z.boolean().default(false),
  // Só o narrar aceita: "prefacio,cap1" (vazio = todos)
  capitulos: z.string().regex(/^[a-z0-9-]+(,[a-z0-9-]+)*$/).max(400).optional(),
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Leitura (GET) tenta de novo em falha passageira (rede, 429, 5xx) com espera crescente.
// Disparo (POST) nunca repete sozinho: repetir criaria uma execução em dobro.
export const ESPERAS_MS = [400, 1200];
const passageira = (r: Response) => r.status === 429 || r.status >= 500;

async function github(env: Env, caminho: string, init: RequestInit = {}): Promise<Response> {
  const leitura = (init.method ?? 'GET') === 'GET';
  for (let tentativa = 0; ; tentativa++) {
    const ultima = !leitura || tentativa >= ESPERAS_MS.length;
    try {
      const r = await githubUmaVez(env, caminho, init);
      if (ultima || !passageira(r)) return r;
    } catch (e) {
      if (ultima) throw e;
    }
    await new Promise((ok) => setTimeout(ok, ESPERAS_MS[tentativa]));
  }
}

function githubUmaVez(env: Env, caminho: string, init: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com/repos/${env.GH_PRODUCAO_REPO ?? REPO_PADRAO}${caminho}`, {
    ...init,
    signal: AbortSignal.timeout(15_000),
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${env.GH_PRODUCAO_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': '3trevo-admin',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

// Erro do GitHub vira código curto; a mensagem dele não chega ao navegador.
function erroGithub(r: Response): Response {
  const erro =
    r.status === 401 ? 'github_token_invalido'
    : r.status === 403 ? 'github_sem_permissao'
    : r.status === 404 ? 'github_workflow_ou_repo_nao_encontrado'
    : r.status === 422 ? 'github_entrada_recusada'
    : 'github_indisponivel';
  return json({ ok: false, erro }, 502);
}

type ObraJson = {
  tipo?: string;
  perfil_ajustes?: Record<string, unknown>;
  ficha?: { titulo?: string; autor?: string; edicao?: string };
};

const lerArquivo = (env: Env, nome: string) =>
  github(env, `/contents/scripts/obras/${nome}?ref=main`, { headers: { Accept: 'application/vnd.github.raw+json' } });

// O perfil de produção mora em scripts/obras/perfis.json (validado lá por perfil.py, que também
// aplica perfil_ajustes). Aqui ele só é mostrado: perfil do tipo + ajustes da obra, sem mesclar.
async function listarObras(env: Env): Promise<Response> {
  const [rObras, rPerfis] = await Promise.all([lerArquivo(env, 'obras.json'), lerArquivo(env, 'perfis.json')]);
  if (!rObras.ok) return erroGithub(rObras);
  const dados = (await rObras.json()) as Record<string, ObraJson>;
  // Sem perfis.json (repositório antigo) a lista de obras continua funcionando.
  const tipos = rPerfis.ok
    ? (((await rPerfis.json()) as { tipos?: Record<string, unknown> }).tipos ?? {})
    : {};
  const obras = Object.entries(dados)
    .filter(([slug]) => SLUG.test(slug))
    .map(([slug, o]) => ({
      slug,
      titulo: o.ficha?.titulo ?? slug,
      autor: o.ficha?.autor ?? null,
      edicao: o.ficha?.edicao ?? null,
      tipo: o.tipo ?? null,
      perfil: (o.tipo && tipos[o.tipo]) || null,
      ajustes: o.perfil_ajustes ?? null,
    }));
  return json({ ok: true, obras });
}

type Run = {
  id: number; name: string; display_title: string; status: string; conclusion: string | null;
  html_url: string; created_at: string; updated_at: string; path: string;
};

// O título de cada execução é "Compor · <slug>[ · publicar]" (run-name nos workflows).
export function resumirExecucao(run: Run) {
  const etapa = (Object.keys(WORKFLOWS) as Etapa[]).find((e) => run.path.endsWith(WORKFLOWS[e])) ?? null;
  const [, slug = null] = run.display_title.split(' · ');
  return {
    id: run.id,
    etapa,
    slug,
    publicar: run.display_title.endsWith(' · publicar'),
    titulo: run.display_title,
    status: run.status,          // queued | in_progress | completed
    conclusao: run.conclusion,   // success | failure | cancelled | null
    url: run.html_url,
    criado: run.created_at,
    atualizado: run.updated_at,
  };
}

async function listarExecucoes(env: Env, slug: string | null): Promise<Response> {
  if (slug !== null && !SLUG.test(slug)) return json({ ok: false, erro: 'slug_invalido' }, 400);
  const respostas = await Promise.all(
    Object.values(WORKFLOWS).map((arq) => github(env, `/actions/workflows/${arq}/runs?per_page=15`)),
  );
  const falha = respostas.find((r) => !r.ok);
  if (falha) return erroGithub(falha);
  const runs = (await Promise.all(respostas.map((r) => r.json() as Promise<{ workflow_runs: Run[] }>)))
    .flatMap((d) => d.workflow_runs ?? [])
    .map(resumirExecucao)
    .filter((e) => e.etapa && (slug === null || e.slug === slug))
    .sort((a, b) => b.criado.localeCompare(a.criado))
    .slice(0, 20);
  return json({ ok: true, execucoes: runs });
}

async function disparar(request: Request, env: Env): Promise<Response> {
  const bruto = await request.json().catch(() => null);
  const v = dispararSchema.safeParse(bruto);
  if (!v.success) return json({ ok: false, erro: 'corpo_invalido', detalhe: v.error.issues[0]?.message }, 400);
  const { slug, etapa, publicar, capitulos } = v.data;
  if (capitulos && etapa !== 'narrar') return json({ ok: false, erro: 'capitulos_so_no_narrar' }, 400);

  const inputs: Record<string, string> = { slug, publicar: publicar ? 'PUBLICAR' : '' };
  if (etapa === 'narrar') inputs.capitulos = capitulos ?? '';

  const r = await github(env, `/actions/workflows/${WORKFLOWS[etapa]}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: 'main', inputs }),
  });
  if (!r.ok) return erroGithub(r); // 204 (ou 200, quando o GitHub devolve detalhes da execução)
  console.log(`[producao] disparado ${etapa} ${slug}${publicar ? ' (publicar)' : ''}`);
  return json({ ok: true, etapa, slug, publicar }, 202);
}

export async function handleAdminProducao(request: Request, env: Env, path: string): Promise<Response> {
  if (!(await verificarToken(request, env))) return json({ ok: false, erro: 'unauthorized' }, 401);
  if (!env.GH_PRODUCAO_TOKEN) return json({ ok: false, erro: 'github_token_ausente' }, 503);

  const acao = path.slice(PREFIXO.length);
  try {
    if (acao === 'obras' && request.method === 'GET') return await listarObras(env);
    if (acao === 'execucoes' && request.method === 'GET') {
      return await listarExecucoes(env, new URL(request.url).searchParams.get('slug'));
    }
    if (acao === 'disparar' && request.method === 'POST') return await disparar(request, env);
  } catch (e) {
    console.error('[producao] falha ao falar com o GitHub:', e);
    return json({ ok: false, erro: 'github_indisponivel' }, 502);
  }
  return json({ ok: false, erro: 'rota_producao_desconhecida' }, 404);
}
