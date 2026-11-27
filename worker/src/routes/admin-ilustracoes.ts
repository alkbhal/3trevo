/**
 * admin-ilustracoes.ts — galeria de aprovação das ilustrações (aba Produção do admin).
 *
 * O workflow "Ilustrar obra" (tr3vo-forge) grava no bucket privado media, em ilustracoes/<slug>/:
 *   plano.json, manifest-ilustracao.json, folhas/<id>.jpg, cenas/<id>.jpg
 * O admin grava aprovacao.json no mesmo lugar: { decisoes: { "cena:cap1-1": { decisao, sha256, nota, quando } } }.
 * A decisão vale para aquele sha256: imagem refeita tem outro hash e volta a precisar de aprovação.
 * O "Compor obra" só usa cenas aprovadas; o "Ilustrar obra" só usa folhas aprovadas como referência.
 *
 * GET  /api/admin/producao/ilustracoes?slug=X
 * POST /api/admin/producao/ilustracoes/decidir  { slug, tipo: folha|cena, id, sha256, decisao: aprovada|rejeitada, nota? }
 *
 * Gravação de aprovacao.json é ler-mudar-gravar: com um só editor no admin é suficiente; duas pessoas
 * decidindo ao mesmo tempo poderiam sobrescrever uma à outra.
 */

import { z } from 'zod';
import type { Env } from '../types';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const BUCKET = 'media';
const URL_VALIDA_S = 900; // links das imagens valem 15 min

type Imagem = {
  id: string; tipo: 'folha' | 'cena'; arquivo: string; sha256: string;
  capitulo?: string; cena?: string; alt?: string; pixels?: number[] | null;
};
type Manifest = { slug: string; modelo_imagem?: string; custo_estimado_usd?: number; imagens: Imagem[] };
type Decisao = { decisao: 'aprovada' | 'rejeitada'; sha256: string; nota?: string; quando: string };
type Aprovacao = { decisoes: Record<string, Decisao> };

const decidirSchema = z.object({
  slug: z.string().regex(SLUG).max(80),
  tipo: z.enum(['folha', 'cena']),
  id: z.string().regex(/^[a-z0-9-]{1,80}$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  decisao: z.enum(['aprovada', 'rejeitada']),
  nota: z.string().trim().max(500).optional(),
});

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

// Leitura tenta de novo em falha passageira (rede, 429, 5xx); gravação não repete sozinha.
async function storage(env: Env, caminho: string, init: RequestInit = {}): Promise<Response> {
  const leitura = (init.method ?? 'GET') === 'GET';
  for (let tentativa = 0; ; tentativa++) {
    const ultima = !leitura || tentativa >= 2;
    try {
      const r = await storageUmaVez(env, caminho, init);
      if (ultima || !(r.status === 429 || r.status >= 500)) return r;
    } catch (e) {
      if (ultima) throw e;
    }
    await new Promise((ok) => setTimeout(ok, 300 * (tentativa + 1)));
  }
}

function storageUmaVez(env: Env, caminho: string, init: RequestInit): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/storage/v1/${caminho}`, {
    ...init,
    signal: AbortSignal.timeout(10_000),
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      ...(init.headers as Record<string, string> ?? {}),
    },
  });
}

// JSON do depósito; null quando ainda não existe (Supabase responde 400 ou 404 para objeto ausente).
async function lerJson<T>(env: Env, slug: string, nome: string): Promise<T | null> {
  const r = await storage(env, `object/${BUCKET}/ilustracoes/${slug}/${nome}`);
  if (r.status === 404 || r.status === 400) return null;
  if (!r.ok) throw new Error(`storage ${r.status} ao ler ${nome}`);
  return (await r.json()) as T;
}

const pasta = (tipo: Imagem['tipo']) => (tipo === 'folha' ? 'folhas' : 'cenas');

async function galeria(env: Env, slug: string | null): Promise<Response> {
  if (!slug || !SLUG.test(slug)) return json({ ok: false, erro: 'slug_invalido' }, 400);
  const [manifest, aprovacao, plano] = await Promise.all([
    lerJson<Manifest>(env, slug, 'manifest-ilustracao.json'),
    lerJson<Aprovacao>(env, slug, 'aprovacao.json'),
    lerJson<{ custo_estimado_usd?: number; densidade?: string; itens?: unknown[] }>(env, slug, 'plano.json'),
  ]);
  if (!manifest) return json({ ok: true, imagens: [], plano: plano ? resumoPlano(plano) : null });

  const caminhos = manifest.imagens.map((i) => `ilustracoes/${slug}/${pasta(i.tipo)}/${i.arquivo}`);
  const urls: Record<string, string> = {};
  if (caminhos.length) {
    const r = await storage(env, `object/sign/${BUCKET}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn: URL_VALIDA_S, paths: caminhos }),
    });
    if (!r.ok) throw new Error(`storage ${r.status} ao assinar links`);
    for (const s of (await r.json()) as { path: string; signedURL?: string; error?: string | null }[]) {
      if (s.signedURL) urls[s.path] = `${env.SUPABASE_URL}/storage/v1${s.signedURL}`;
    }
  }
  const decisoes = aprovacao?.decisoes ?? {};
  const imagens = manifest.imagens.map((i, k) => {
    const d = decisoes[`${i.tipo}:${i.id}`];
    // decisão de uma versão anterior da imagem não vale para esta
    const vale = d && d.sha256 === i.sha256 ? d : null;
    return {
      tipo: i.tipo, id: i.id, capitulo: i.capitulo ?? null, cena: i.cena ?? null, alt: i.alt ?? null,
      sha256: i.sha256, url: urls[caminhos[k]] ?? null,
      decisao: vale?.decisao ?? 'pendente', nota: vale?.nota ?? null, quando: vale?.quando ?? null,
    };
  });
  return json({ ok: true, modelo: manifest.modelo_imagem ?? null, imagens, plano: plano ? resumoPlano(plano) : null });
}

function resumoPlano(p: { custo_estimado_usd?: number; densidade?: string; itens?: unknown[] }) {
  return { densidade: p.densidade ?? null, cenas: Array.isArray(p.itens) ? p.itens.length : 0, custo_estimado_usd: p.custo_estimado_usd ?? null };
}

async function decidir(request: Request, env: Env): Promise<Response> {
  const v = decidirSchema.safeParse(await request.json().catch(() => null));
  if (!v.success) return json({ ok: false, erro: 'corpo_invalido', detalhe: v.error.issues[0]?.message }, 400);
  const { slug, tipo, id, sha256, decisao, nota } = v.data;

  // Só se decide sobre a imagem que está no manifest agora (evita aprovar uma versão já substituída).
  const manifest = await lerJson<Manifest>(env, slug, 'manifest-ilustracao.json');
  const img = manifest?.imagens.find((i) => i.tipo === tipo && i.id === id);
  if (!img) return json({ ok: false, erro: 'imagem_nao_encontrada' }, 404);
  if (img.sha256 !== sha256) return json({ ok: false, erro: 'imagem_mudou' }, 409);

  const aprovacao = (await lerJson<Aprovacao>(env, slug, 'aprovacao.json')) ?? { decisoes: {} };
  aprovacao.decisoes[`${tipo}:${id}`] = { decisao, sha256, ...(nota ? { nota } : {}), quando: new Date().toISOString() };
  const r = await storage(env, `object/${BUCKET}/ilustracoes/${slug}/aprovacao.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' },
    body: JSON.stringify(aprovacao, null, 2),
  });
  if (!r.ok) throw new Error(`storage ${r.status} ao gravar aprovacao.json`);
  console.log(`[ilustracoes] ${slug} ${tipo}:${id} ${decisao}`);
  return json({ ok: true, tipo, id, decisao });
}

export async function handleIlustracoes(request: Request, env: Env, acao: string): Promise<Response> {
  try {
    if (acao === 'ilustracoes' && request.method === 'GET') {
      return await galeria(env, new URL(request.url).searchParams.get('slug'));
    }
    if (acao === 'ilustracoes/decidir' && request.method === 'POST') return await decidir(request, env);
  } catch (e) {
    console.error('[ilustracoes] falha no Storage:', e);
    return json({ ok: false, erro: 'storage_indisponivel' }, 502);
  }
  return json({ ok: false, erro: 'rota_producao_desconhecida' }, 404);
}
