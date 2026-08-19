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
import { sb } from '../sb';
import { sha256 } from './admin-auth';

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
      'catalogo?order=ordem.asc&select=slug,titulo,titulo_en,titulo_es,descricao,descricao_en,descricao_es,genero,genero_pt,genero_en,genero_es,autor,preco,cotas,utm_campaign,bg_color,capa_url,ordem,ativo'
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
      capa_url: body.capa_url ?? null,
      ordem: body.ordem ?? 99,
      ativo: body.ativo !== false,
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
    preco: body.preco ?? 0,
    cotas: body.cotas ?? 1,
    ativo: body.ativo !== false,
  });

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
    'utm_campaign','bg_color','capa_url','ordem','ativo','slug',
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

// ─── Admin SQL-safe: insert em tabela permitida ─────────────────────────────
export async function handleAdminTableInsert(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }

  const { table, rows } = body;
  const allowed = ['email_templates', 'campaigns', 'leads'];
  if (!allowed.includes(table)) return Response.json({ ok: false, erro: 'tabela_nao_permitida' }, { status: 403 });
  if (!Array.isArray(rows)) return Response.json({ ok: false, erro: 'rows deve ser array' }, { status: 400 });

  const r = await sb(env, table, {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' } as any,
    body: JSON.stringify(rows),
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
