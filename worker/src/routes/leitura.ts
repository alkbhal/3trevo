// Leitura interativa: capítulos pagos de uma obra, só para quem comprou.
// GET /api/leitura/:slug — 401 sem login; 403 sem compra; 200 com os capítulos.
// O texto fica em public.obra_conteudo (sem acesso anon/authenticated); a compra é a
// linha permanente em user_library, a mesma regra de /api/atico/acesso.
import type { Env } from '../types';
import { usuarioDoToken } from './nema';

export const OBRAS_INTERATIVAS = new Set(['livre-das-dividas']);
const SLUG_OK = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/;

export async function handleLeitura(request: Request, env: Env, slug: string): Promise<Response> {
  if (!SLUG_OK.test(slug) || !OBRAS_INTERATIVAS.has(slug)) {
    return Response.json({ ok: false, erro: 'obra_desconhecida' }, { status: 404 });
  }
  const user = await usuarioDoToken(request, env);
  if (!user) return Response.json({ ok: false, erro: 'login_necessario' }, { status: 401 });

  const headers = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` };
  try {
    const compra = await fetch(
      `${env.SUPABASE_URL}/rest/v1/user_library?user_id=eq.${encodeURIComponent(user.id)}` +
        `&select=product_id,products!inner(slug)&products.slug=eq.${encodeURIComponent(slug)}`,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    if (!compra.ok) {
      console.error('[leitura] consulta da biblioteca falhou:', compra.status);
      return Response.json({ ok: false, erro: 'indisponivel' }, { status: 503 });
    }
    const linhas = (await compra.json()) as unknown[];
    if (!Array.isArray(linhas) || linhas.length === 0) {
      return Response.json({ ok: false, erro: 'sem_compra' }, { status: 403 });
    }
    const cont = await fetch(
      `${env.SUPABASE_URL}/rest/v1/obra_conteudo?slug=eq.${encodeURIComponent(slug)}` +
        `&select=capitulo_id,conteudo,versao&order=ordem.asc`,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    if (!cont.ok) {
      console.error('[leitura] conteúdo indisponível:', cont.status);
      return Response.json({ ok: false, erro: 'indisponivel' }, { status: 503 });
    }
    const rows = (await cont.json()) as { capitulo_id: string; conteudo: unknown; versao: string }[];
    if (!rows.length) return Response.json({ ok: false, erro: 'indisponivel' }, { status: 503 });
    return Response.json(
      { ok: true, versao: rows[0].versao, capitulos: rows.map((r) => r.conteudo) },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[leitura] erro:', err);
    return Response.json({ ok: false, erro: 'indisponivel' }, { status: 503 });
  }
}
