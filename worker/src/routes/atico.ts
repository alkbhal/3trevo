// Direito ao plano completo do Ático (produto 'atico-plano', tipo acesso_app).
// Quem comprou tem a linha em user_library, que é permanente. Sem login: 401.
import type { Env } from '../types';
import { usuarioDoToken } from './nema';

const PRODUTO_ATICO = 'atico-plano';

export async function handleAticoAcesso(request: Request, env: Env): Promise<Response> {
  const user = await usuarioDoToken(request, env);
  if (!user) return Response.json({ ok: false, erro: 'login_necessario' }, { status: 401 });

  const url =
    `${env.SUPABASE_URL}/rest/v1/user_library` +
    `?user_id=eq.${encodeURIComponent(user.id)}` +
    `&select=product_id,products!inner(slug)` +
    `&products.slug=eq.${PRODUTO_ATICO}`;
  try {
    const resp = await fetch(url, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) {
      console.error('[atico] consulta da biblioteca falhou:', resp.status);
      return Response.json({ ok: false, erro: 'acesso_indisponivel' }, { status: 503 });
    }
    const linhas = (await resp.json()) as unknown[];
    return Response.json({ ok: true, acesso: Array.isArray(linhas) && linhas.length > 0 });
  } catch (err) {
    console.error('[atico] erro na consulta:', err);
    return Response.json({ ok: false, erro: 'acesso_indisponivel' }, { status: 503 });
  }
}
