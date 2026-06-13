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

import type { Env } from '../types';

// ─── Auth helper ─────────────────────────────────────────────────────────────
export async function verificarToken(request: Request, env: Env): Promise<boolean> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return false;
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/admin_sessoes?token=eq.${encodeURIComponent(token)}&ativa=eq.true&select=expira_em`,
    { headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
  );
  const rows = (await r.json()) as any[];
  return rows.length > 0 && new Date(rows[0].expira_em) > new Date();
}

function sb(env: Env, path: string, opts: RequestInit = {}) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });
}

// ─── Listar todos (admin — inclui inativos) ───────────────────────────────────
export async function handleAdminCatalogoGet(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });
  const r = await sb(
    env,
    'catalogo?order=ordem.asc&select=slug,titulo,titulo_en,titulo_es,descricao,descricao_en,descricao_es,genero,genero_pt,genero_en,genero_es,autor,preco,cotas,utm_campaign,bg_color,accent_color,ordem,ativo'
  );
  const data = await r.json();
  return Response.json(data);
}

// ─── Criar livro ──────────────────────────────────────────────────────────────
export async function handleAdminCatalogoCreate(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }
  if (!body.slug || !body.titulo) return Response.json({ ok: false, erro: 'slug_e_titulo_obrigatorios' }, { status: 400 });

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
      preco: body.preco ?? 0,
      cotas: body.cotas ?? 1,
      utm_campaign: body.utm_campaign ?? body.slug,
      bg_color: body.bg_color ?? '#0d2415',
      accent_color: body.accent_color ?? '#7ab88a',
      ordem: body.ordem ?? 99,
      ativo: body.ativo !== false,
    }),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    return Response.json({ ok: false, erro: (err as any).message ?? 'supabase_error' }, { status: 400 });
  }

  return Response.json({ ok: true });
}

// ─── Atualizar livro ──────────────────────────────────────────────────────────
export async function handleAdminCatalogoUpdate(request: Request, env: Env, slug: string): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }

  // Campos permitidos para atualização
  const updates: Record<string, any> = {};
  const allowed = [
    'titulo','titulo_en','titulo_es','descricao','descricao_en','descricao_es',
    'genero','genero_pt','genero_en','genero_es','autor','preco','cotas',
    'utm_campaign','bg_color','accent_color','ordem','ativo','slug',
  ];
  for (const k of allowed) { if (k in body) updates[k] = body[k]; }

  const r = await sb(env, `catalogo?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' } as any,
    body: JSON.stringify(updates),
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    return Response.json({ ok: false, erro: (err as any).message ?? 'supabase_error' }, { status: 400 });
  }

  return Response.json({ ok: true });
}

// ─── Inativar livro (soft delete) ─────────────────────────────────────────────
export async function handleAdminCatalogoDelete(request: Request, env: Env, slug: string): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });

  const r = await sb(env, `catalogo?slug=eq.${encodeURIComponent(slug)}`, {
    method: 'PATCH',
    body: JSON.stringify({ ativo: false }),
  });

  if (!r.ok) return Response.json({ ok: false, erro: 'supabase_error' }, { status: 400 });
  return Response.json({ ok: true });
}
