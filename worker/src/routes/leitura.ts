// Leitura interativa: capítulos pagos de uma obra, só para quem comprou.
// GET /api/leitura/:slug — 401 sem login; 403 sem compra; 200 com os capítulos.
// O texto fica em public.obra_conteudo (sem acesso anon/authenticated); a compra é a
// linha permanente em user_library, a mesma regra de /api/atico/acesso.
import type { Env } from '../types';
import { usuarioDoToken } from './nema';

export const OBRAS_INTERATIVAS = new Set(['livre-das-dividas']);
const SLUG_OK = /^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/;

// Regra única de acesso: login + linha em user_library. Devolve a resposta de erro, ou null se liberado.
async function comprador(request: Request, env: Env, slug: string): Promise<Response | null> {
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
    return null;
  } catch (err) {
    console.error('[leitura] erro:', err);
    return Response.json({ ok: false, erro: 'indisponivel' }, { status: 503 });
  }
}

export async function handleLeitura(request: Request, env: Env, slug: string): Promise<Response> {
  const negado = await comprador(request, env, slug);
  if (negado) return negado;
  const headers = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` };
  try {
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

// ─── Áudio pago ──────────────────────────────────────────────────────────────
// GET /api/leitura/:slug/audio — mesma regra de compra. Devolve links assinados (1 hora)
// para cada faixa do manifest publicado pelo workflow "Narrar obra" em
// media/audiobooks/<slug>/. O tocador não envia o token, por isso o link assinado vai no JSON.
const ARQUIVO_AUDIO = /^\d{2}-[a-z0-9-]+\.mp3$/;
const ARQUIVO_M4B = /^[a-z0-9-]+\.m4b$/;
const TTL_AUDIO_S = 3600;

// Link assinado de um arquivo de media/<pasta>; `baixar` faz o navegador salvar com esse nome.
async function assinarAudio(env: Env, pasta: string, arquivo: string, baixar?: string): Promise<string> {
  const r = await fetch(`${env.SUPABASE_URL}/storage/v1/object/sign/media/${pasta}/${arquivo}`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: TTL_AUDIO_S }),
    signal: AbortSignal.timeout(8000),
  });
  const d = (await r.json().catch(() => ({}))) as { signedURL?: string };
  if (!r.ok || !d.signedURL) throw new Error(`assinatura ${arquivo}: ${r.status}`);
  const url = `${env.SUPABASE_URL}/storage/v1${d.signedURL}`;
  return baixar ? `${url}&download=${encodeURIComponent(baixar)}` : url;
}

export async function handleLeituraAudio(request: Request, env: Env, slug: string): Promise<Response> {
  const negado = await comprador(request, env, slug);
  if (negado) return negado;
  const headers = { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` };
  const pasta = `audiobooks/${slug}`;
  try {
    const mf = await fetch(`${env.SUPABASE_URL}/storage/v1/object/media/${pasta}/manifest-audio.json`, {
      headers, signal: AbortSignal.timeout(8000),
    });
    if (mf.status === 404) return Response.json({ ok: false, erro: 'sem_audio' }, { status: 404 });
    if (!mf.ok) return Response.json({ ok: false, erro: 'indisponivel' }, { status: 503 });
    const m = (await mf.json()) as {
      versao_texto?: string;
      faixas?: { id: string; titulo: string; arquivo: string; segundos: number }[];
      audiobook?: { arquivo: string; minutos?: number; bytes?: number } | null;
    };
    const faixas = (m.faixas ?? []).filter((f) => ARQUIVO_AUDIO.test(f.arquivo));
    const assinadas = await Promise.all(
      faixas.map(async (f) => ({
        id: f.id, titulo: f.titulo, segundos: f.segundos, url: await assinarAudio(env, pasta, f.arquivo),
      }))
    );
    // Livro inteiro em um arquivo (M4B com capítulos), para baixar e ouvir em qualquer app de audiobook.
    // Se ele não estiver no depósito (acima do limite de upload), as faixas continuam valendo.
    let audiobook: { url: string; minutos: number | null; bytes: number | null } | null = null;
    if (m.audiobook && ARQUIVO_M4B.test(m.audiobook.arquivo)) {
      try {
        audiobook = {
          url: await assinarAudio(env, pasta, m.audiobook.arquivo, m.audiobook.arquivo),
          minutos: m.audiobook.minutos ?? null,
          bytes: m.audiobook.bytes ?? null,
        };
      } catch (err) {
        console.error('[leitura-audio] M4B indisponível:', err);
      }
    }
    return Response.json(
      { ok: true, versao: m.versao_texto ?? '', faixas: assinadas, audiobook },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[leitura-audio] erro:', err);
    return Response.json({ ok: false, erro: 'indisponivel' }, { status: 503 });
  }
}
