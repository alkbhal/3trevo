// Leitura interativa: o texto vem de UMA cópia publicada, public.obra_conteudo, derivada do
// Doc canônico do Drive pelo forge (scripts/obras/gerar-leitura.py). O site não guarda texto.
// GET /api/leitura/:slug
//   - sem login ou sem compra: índice completo + capítulos com acesso 'livre';
//   - comprador (linha em user_library): índice + todos os capítulos.
// A tabela não tem leitura para anon/authenticated: só este worker (service key) lê.
import type { Env } from '../types';
import { usuarioDoToken } from './nema';

export const OBRAS_INTERATIVAS = new Set(['livre-das-dividas']);
const SLUG_OK = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/;

type Linha = { capitulo_id: string; acesso: 'livre' | 'compra'; versao: string; conteudo: { titulo?: string } };

async function comprou(env: Env, userId: string, slug: string, headers: HeadersInit): Promise<boolean | null> {
  const r = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_library?user_id=eq.${encodeURIComponent(userId)}` +
      `&select=product_id,products!inner(slug)&products.slug=eq.${encodeURIComponent(slug)}`,
    { headers, signal: AbortSignal.timeout(8000) }
  );
  if (!r.ok) { console.error('[leitura] consulta da biblioteca falhou:', r.status); return null; }
  const linhas = (await r.json()) as unknown[];
  return Array.isArray(linhas) && linhas.length > 0;
}

export async function handleLeitura(request: Request, env: Env, slug: string): Promise<Response> {
  if (!SLUG_OK.test(slug) || !OBRAS_INTERATIVAS.has(slug)) {
    return Response.json({ ok: false, erro: 'obra_desconhecida' }, { status: 404 });
  }
  const headers = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` };
  try {
    const user = request.headers.get('Authorization') ? await usuarioDoToken(request, env) : null;
    let comprador = false;
    if (user) {
      const c = await comprou(env, user.id, slug, headers);
      if (c === null) return Response.json({ ok: false, erro: 'indisponivel' }, { status: 503 });
      comprador = c;
    }
    const cont = await fetch(
      `${env.SUPABASE_URL}/rest/v1/obra_conteudo?slug=eq.${encodeURIComponent(slug)}` +
        `&select=capitulo_id,acesso,versao,conteudo&order=ordem.asc`,
      { headers, signal: AbortSignal.timeout(8000) }
    );
    if (!cont.ok) {
      console.error('[leitura] conteúdo indisponível:', cont.status);
      return Response.json({ ok: false, erro: 'indisponivel' }, { status: 503 });
    }
    const rows = (await cont.json()) as Linha[];
    if (!rows.length) return Response.json({ ok: false, erro: 'indisponivel' }, { status: 503 });
    const indice = rows.map((r) => ({ id: r.capitulo_id, titulo: r.conteudo?.titulo ?? r.capitulo_id, acesso: r.acesso }));
    const capitulos = rows.filter((r) => comprador || r.acesso === 'livre').map((r) => r.conteudo);
    return Response.json(
      { ok: true, versao: rows[0].versao, logado: !!user, comprador, indice, capitulos },
      { headers: { 'Cache-Control': comprador || user ? 'private, no-store' : 'public, max-age=300' } }
    );
  } catch (err) {
    console.error('[leitura] erro:', err);
    return Response.json({ ok: false, erro: 'indisponivel' }, { status: 503 });
  }
}
