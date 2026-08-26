/**
 * admin-catalog.ts — Três Trevo Worker
 * CRUD do catálogo via Supabase (tabela: catalogo)
 * Todas as rotas exigem token admin válido.
 *
 * GET    /api/admin/catalogo          — lista todos (incl. inativos)
 * POST   /api/admin/catalogo          — cria novo livro
 * PUT    /api/admin/catalogo/:slug    — atualiza livro
 * DELETE /api/admin/catalogo/:slug    — inativa livro (soft delete)
 */

import { z } from 'zod';
import type { Env } from '../types';
import { sb } from '../sb';
import { sha256 } from './admin-auth';

// ─── Validação Zod — antes o worker só checava existência (slug/titulo), nunca
// tipo/faixa (achado da auditoria "Fonte Única", 21/08). Um único schema pra
// create/update: todo campo opcional aqui, quem exige slug/titulo é o handler.
export const catalogoInputSchema = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'slug deve ser kebab-case').optional(),
  titulo: z.string().min(1).max(300).optional(),
  titulo_en: z.string().max(300).nullable().optional(),
  titulo_es: z.string().max(300).nullable().optional(),
  descricao: z.string().max(5000).nullable().optional(),
  descricao_en: z.string().max(5000).nullable().optional(),
  descricao_es: z.string().max(5000).nullable().optional(),
  genero: z.string().max(100).nullable().optional(),
  genero_pt: z.string().max(100).nullable().optional(),
  genero_en: z.string().max(100).nullable().optional(),
  genero_es: z.string().max(100).nullable().optional(),
  autor: z.string().max(200).nullable().optional(),
  preco: z.number().min(0).max(10000).optional(),
  utm_campaign: z.string().max(100).nullable().optional(),
  bg_color: z.string().max(20).nullable().optional(),
  capa_url: z.string().max(500).nullable().optional(),
  ordem: z.number().int().min(0).max(9999).optional(),
  ativo: z.boolean().optional(),
  motivo_inativo: z.string().max(500).nullable().optional(),
});

function erroValidacao(issues: z.ZodIssue[]): Response {
  return Response.json(
    { ok: false, erro: 'validacao', detalhe: issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
    { status: 400 }
  );
}

// ─── Auth helper ─────────────────────────────────────────────────────────────
export async function verificarToken(request: Request, env: Env): Promise<boolean> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return false;
  const hash = await sha256(token);
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/admin_sessoes?token_hash=eq.${encodeURIComponent(hash)}&ativa=eq.true&select=expira_em`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const rows = (await r.json()) as any[];
  return rows.length > 0 && new Date(rows[0].expira_em) > new Date();
}


// ─── Cotas por faixa de preço (regra de negócio, única fonte de verdade) ─────
// products.cotas é o que registrar_compra_mp lê pra decidir quantos números o
// comprador recebe no sorteio real (Programa Cultural, Lei 5.768/71) -- nunca deve
// divergir do preço cobrado. Antes disto, "cotas" era um <select> manual em
// admin.html, desconectado do preço (achado real: isa-isma-tintim custava R$19,90,
// dentro da faixa de 1 cota, mas tinha 3 cotas gravadas por escolha manual errada).
function cotasPorPreco(preco: number): number {
  if (preco <= 20) return 1;
  if (preco <= 30) return 3;
  return 10;
}

// ─── Espelhar catalogo → products (fonte de verdade é catalogo; products é o que
//     registrar_compra_mp exige pra liberar a compra após pagamento aprovado) ────
async function mirrorParaProducts(env: Env, slug: string, campos: Record<string, any>): Promise<void> {
  const permitido: Record<string, any> = {};
  for (const k of ['slug', 'titulo', 'autor', 'preco', 'cotas', 'ativo']) {
    if (k in campos) permitido[k] = campos[k];
  }
  if (!Object.keys(permitido).length) return;

  try {
    const rPatch = await sb(env, `products?slug=eq.${encodeURIComponent(slug)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' } as any,
      body: JSON.stringify(permitido),
    });
    const linhas = rPatch.ok ? await rPatch.json().catch(() => []) : [];
    if (Array.isArray(linhas) && linhas.length > 0) return; // já existia, sincronizado

    // Nunca existiu em products — só cria se tiver os campos obrigatórios (titulo, preco)
    if (!('titulo' in permitido) || !('preco' in permitido)) return;
    await sb(env, 'products', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } as any,
      body: JSON.stringify({ slug, cotas: 0, autor: 'Said Anes', ...permitido }),
    });
  } catch (err) {
    console.error('[admin-catalogo] mirror pra products falhou:', slug, err);
  }
}

// ─── Listar todos (admin — inclui inativos) ───────────────────────────────────
export async function handleAdminCatalogoGet(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });
  try {
    const r = await sb(
      env,
      'catalogo?order=ordem.asc&select=slug,titulo,titulo_en,titulo_es,descricao,descricao_en,descricao_es,genero,genero_pt,genero_en,genero_es,autor,preco,cotas,utm_campaign,bg_color,capa_url,ordem,ativo,motivo_inativo'
    );
    if (!r.ok) {
      const err = await r.text();
      console.error('[admin-catalogo] supabase error:', r.status, err);
      return Response.json({ ok: false, erro: 'supabase_error', status: r.status, detalhe: err }, { status: 502 });
    }
    return Response.json(await r.json());
  } catch (err) {
    console.error('[admin-catalogo] get falhou:', err);
    return Response.json({ ok: false, erro: 'catalogo_indisponivel', detalhe: String(err) }, { status: 503 });
  }
}

// ─── Criar livro ──────────────────────────────────────────────────────────────
export async function handleAdminCatalogoCreate(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });
  let bodyRaw: any;
  try { bodyRaw = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }
  const parsed = catalogoInputSchema.safeParse(bodyRaw);
  if (!parsed.success) return erroValidacao(parsed.error.issues);
  const body = parsed.data;
  if (!body.slug || !body.titulo) return Response.json({ ok: false, erro: 'slug_e_titulo_obrigatorios' }, { status: 400 });

  const preco = body.preco ?? 0;
  const cotas = cotasPorPreco(preco); // sempre derivado do preço -- body.cotas é ignorado de propósito

  const r = await sb(env, 'catalogo', {
    method: 'POST',
    headers: { Prefer: 'return=representation' } as any,
    body: JSON.stringify({
      slug: body.slug,
      titulo: body.titulo,
      titulo_en: body.titulo_en ?? null,
      titulo_es: body.titulo_es ?? null,
      descricao: body.descricao ?? null,
      descricao_en: body.descricao_en ?? null,
      descricao_es: body.descricao_es ?? null,
      genero: body.genero ?? null,
      genero_pt: body.genero_pt ?? body.genero ?? null,
      genero_en: body.genero_en ?? null,
      genero_es: body.genero_es ?? null,
      autor: body.autor ?? 'Said Anes',
      preco,
      cotas,
      utm_campaign: body.utm_campaign ?? body.slug,
      bg_color: body.bg_color ?? '#0d2415',
      capa_url: body.capa_url ?? null,
      ordem: body.ordem ?? 99,
      ativo: body.ativo !== false,
      motivo_inativo: body.motivo_inativo ?? null,
    }),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    return Response.json({ ok: false, erro: (err as any).message ?? 'supabase_error' }, { status: 400 });
  }

  await mirrorParaProducts(env, body.slug, {
    slug: body.slug,
    titulo: body.titulo,
    autor: body.autor ?? 'Said Anes',
    preco,
    cotas,
    ativo: body.ativo !== false,
  });

  return Response.json({ ok: true });
}

// ─── Atualizar livro ──────────────────────────────────────────────────────────
export async function handleAdminCatalogoUpdate(request: Request, env: Env, slug: string): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });
  let bodyRaw: any;
  try { bodyRaw = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }
  const parsed = catalogoInputSchema.safeParse(bodyRaw);
  if (!parsed.success) return erroValidacao(parsed.error.issues);
  const body: Record<string, any> = parsed.data;

  // Campos permitidos para atualização. "cotas" de propósito fora da lista -- nunca
  // aceito direto do cliente, sempre recalculado de "preco" (ver cotasPorPreco acima).
  const updates: Record<string, any> = {};
  const allowed = [
    'titulo','titulo_en','titulo_es','descricao','descricao_en','descricao_es',
    'genero','genero_pt','genero_en','genero_es','autor','preco',
    'utm_campaign','bg_color','capa_url','ordem','ativo','slug','motivo_inativo',
  ];
  for (const k of allowed) { if (k in body) updates[k] = body[k]; }
  if ('preco' in updates) updates.cotas = cotasPorPreco(updates.preco);

  const r = await sb(env, `catalogo?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' } as any,
    body: JSON.stringify(updates),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    return Response.json({ ok: false, erro: (err as any).message ?? 'supabase_error' }, { status: 400 });
  }

  // usa o slug da ROTA (identificador atual) pra achar a linha em products — se `updates.slug`
  // for uma renomeação, mirrorParaProducts já inclui o campo no PATCH e renomeia junto
  await mirrorParaProducts(env, slug, updates);

  return Response.json({ ok: true });
}

// ─── Patch catalogo direto (corrige encoding, autor) ─────────────────────────
export async function handleAdminCatalogoPatch(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }

  const { updates } = body;
  if (!Array.isArray(updates)) return Response.json({ ok: false, erro: 'updates deve ser array' }, { status: 400 });

  const results: any[] = [];
  for (const u of updates) {
    if (!u.slug) continue;
    const fields: Record<string, any> = {};
    for (const k of ['titulo', 'descricao', 'genero', 'genero_pt', 'autor']) {
      if (k in u) fields[k] = u[k];
    }
    const r = await sb(env, `catalogo?slug=eq.${encodeURIComponent(u.slug)}`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    });
    results.push({ slug: u.slug, ok: r.ok, status: r.status });
  }
  return Response.json({ ok: true, results });
}

// ─── handleAdminTableInsert: 1 schema Zod por tabela permitida (nenhuma validação
// existia antes -- schema real conferido em supabase/growth-engine.sql:21-118) ────
const leadsRowSchema = z.object({
  email: z.string().email().max(200),
  nome: z.string().max(200).nullable().optional(),
  whatsapp: z.string().max(30).nullable().optional(),
  source: z.string().max(50).nullable().optional(),
  utm_source: z.string().max(100).nullable().optional(),
  utm_medium: z.string().max(100).nullable().optional(),
  utm_campaign: z.string().max(100).nullable().optional(),
  utm_content: z.string().max(100).nullable().optional(),
  utm_term: z.string().max(100).nullable().optional(),
  status: z.string().max(50).nullable().optional(),
  score: z.number().int().optional(),
});

const campaignsRowSchema = z.object({
  name: z.string().min(1).max(200),
  utm_campaign: z.string().min(1).max(100),
  channel: z.string().min(1).max(50),
  budget_daily: z.number().min(0).optional(),
  budget_total: z.number().min(0).optional(),
  spent: z.number().min(0).optional(),
  revenue: z.number().min(0).optional(),
  tier: z.number().int().optional(),
  status: z.string().max(50).optional(),
  paused_reason: z.string().max(300).nullable().optional(),
});

const emailTemplatesRowSchema = z.object({
  id: z.number().int(),
  tag: z.string().min(1).max(100),
  subject: z.string().min(1).max(300),
  html: z.string().min(1),
});

export const tableRowSchemas: Record<string, z.ZodTypeAny> = {
  email_templates: emailTemplatesRowSchema,
  campaigns: campaignsRowSchema,
  leads: leadsRowSchema,
};

// ─── Admin SQL-safe: insert em tabela permitida ─────────────────────────────
export async function handleAdminTableInsert(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }

  const { table, rows } = body;
  const schema = tableRowSchemas[table];
  if (!schema) return Response.json({ ok: false, erro: 'tabela_nao_permitida' }, { status: 403 });
  if (!Array.isArray(rows)) return Response.json({ ok: false, erro: 'rows deve ser array' }, { status: 400 });

  const parsed = z.array(schema).safeParse(rows);
  if (!parsed.success) return erroValidacao(parsed.error.issues);

  const r = await sb(env, table, {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' } as any,
    body: JSON.stringify(parsed.data),
  });
  return Response.json({ ok: r.ok, status: r.status });
}

// ─── Inativar livro (soft delete) ─────────────────────────────────────────────
export async function handleAdminCatalogoDelete(request: Request, env: Env, slug: string): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });

  const r = await sb(env, `catalogo?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ativo: false }),
  });

  if (!r.ok) return Response.json({ ok: false, erro: 'supabase_error' }, { status: 400 });

  await mirrorParaProducts(env, slug, { ativo: false });

  return Response.json({ ok: true });
}
