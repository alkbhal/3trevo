/**
 * biblioteca.ts — Três Trevo Worker
 * Biblioteca TT — Acervo de clássicos em domínio público
 *
 * Públicas:
 *   GET  /api/biblioteca/acervo       — lista livros ativos (sem URL do EPUB)
 *   POST /api/biblioteca/acesso       — envia magic link para email com pedido pago
 *   GET  /api/biblioteca/verificar    — troca magic token por sessão (24h)
 *   GET  /api/biblioteca/stream       — serve EPUB com token temporário (1h)
 *
 * Autenticadas (Bearer sessão):
 *   GET  /api/biblioteca/minha        — slots + histórico do leitor
 *   POST /api/biblioteca/selecionar   — adicionar obra a slot livre
 *   POST /api/biblioteca/marcar-lida  — concluir leitura → libera slot
 *   POST /api/biblioteca/progresso    — salvar página/percentual atual
 *   POST /api/biblioteca/ler          — obter URL de stream do EPUB
 *
 * Admin (Bearer token admin):
 *   GET    /api/admin/biblioteca/acervo        — lista completa com epub_url
 *   POST   /api/admin/biblioteca/acervo        — cadastrar obra
 *   PUT    /api/admin/biblioteca/acervo/:slug  — editar
 *   DELETE /api/admin/biblioteca/acervo/:slug  — desativar
 *   GET    /api/admin/biblioteca/stats         — métricas
 */

import type { Env } from '../types';
import { verificarToken as verificarTokenAdmin } from './admin-catalog';

// ─── Supabase helper ──────────────────────────────────────────────────────────
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

// ─── Auth: verificar sessão de leitor (KV) ───────────────────────────────────
async function sessaoLeitor(request: Request, env: Env): Promise<string | null> {
  const auth = request.headers.get('Authorization') ?? '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token || !env.TT_KV) return null;
  return env.TT_KV.get(`bib:session:${token}`);
}

// ─── Verificar acesso (email com pelo menos 1 pedido pago) ───────────────────
async function temAcesso(email: string, env: Env): Promise<boolean> {
  // 1. Busca cliente pelo email
  const rc = await sb(env, `clientes?email=eq.${encodeURIComponent(email)}&select=id&limit=1`);
  const clientes = (await rc.json()) as any[];
  if (!clientes.length) return false;
  // 2. Verifica pedido pago (status 'pago' ou 'paid')
  const clienteId = clientes[0].id;
  const rp = await sb(env, `pedidos?cliente_id=eq.${clienteId}&status=in.(pago,paid)&select=id&limit=1`);
  const pedidos = (await rp.json()) as any[];
  return pedidos.length > 0;
}

// ─── Token aleatório ──────────────────────────────────────────────────────────
async function gerarToken(bytes: number): Promise<string> {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── POST /api/biblioteca/acesso — Enviar magic link ─────────────────────────
export async function handleBibliotecaAcesso(request: Request, env: Env): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }

  const email = String(body.email ?? '').trim().toLowerCase();
  if (!email || !email.includes('@')) return Response.json({ ok: false, erro: 'email_invalido' }, { status: 400 });

  // Rate limit: 3/email/hora
  if (env.TT_KV) {
    const rlKey = `rl:bib:${email}`;
    const c = parseInt((await env.TT_KV.get(rlKey)) ?? '0', 10);
    if (c >= 3) return Response.json({ ok: false, erro: 'muitas_tentativas' }, { status: 429 });
    await env.TT_KV.put(rlKey, String(c + 1), { expirationTtl: 3600 });
  }

  // Resposta igual seja qual for o resultado (não vaza se email está na base)
  const MSG = 'Se este email tem uma compra ativa, você receberá o link em instantes.';

  const acesso = await temAcesso(email, env);
  if (!acesso) return Response.json({ ok: true, msg: MSG });

  const magicToken = await gerarToken(32);
  if (env.TT_KV) await env.TT_KV.put(`bib:magic:${magicToken}`, email, { expirationTtl: 1800 });

  if (env.RESEND_API_KEY) {
    const link = `https://3trevo.com.br/minha-biblioteca.html?token=${magicToken}`;
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Editora Três Trevo <sac@3trevo.com.br>',
        to: email,
        subject: 'Acesso à sua Biblioteca Clássica TT',
        html: `
<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:40px 20px;background:#f8f5ef;">
  <p style="color:#0f2d1a;font-size:11px;letter-spacing:3px;text-transform:uppercase;margin:0 0 8px;">Editora Três Trevo</p>
  <h2 style="color:#1e5c3a;font-size:22px;font-weight:400;margin:0 0 20px;">📚 Sua Biblioteca Clássica</h2>
  <p style="color:#333;line-height:1.7;margin:0 0 24px;">
    Clique no botão abaixo para acessar sua biblioteca. O link expira em <strong>30 minutos</strong>.
  </p>
  <a href="${link}" style="display:inline-block;background:#1e5c3a;color:#fff;text-decoration:none;
     padding:14px 36px;border-radius:3px;font-size:15px;letter-spacing:0.5px;">
    Acessar minha biblioteca →
  </a>
  <p style="color:#888;font-size:12px;margin-top:28px;line-height:1.6;">
    Se você não solicitou este acesso, ignore este email.<br>
    Editora Três Trevo · sac@3trevo.com.br
  </p>
</div>`,
      }),
    });
  }

  return Response.json({ ok: true, msg: MSG });
}

// ─── GET /api/biblioteca/verificar?token=X — Trocar magic por sessão ─────────
export async function handleBibliotecaVerificar(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const t = url.searchParams.get('token') ?? '';
  if (!t || !env.TT_KV) return Response.json({ ok: false, erro: 'token_invalido' }, { status: 401 });

  const email = await env.TT_KV.get(`bib:magic:${t}`);
  if (!email) return Response.json({ ok: false, erro: 'token_expirado' }, { status: 401 });

  await env.TT_KV.delete(`bib:magic:${t}`); // uso único

  const sessao = await gerarToken(40);
  await env.TT_KV.put(`bib:session:${sessao}`, email, { expirationTtl: 86400 }); // 24h

  return Response.json({ ok: true, token: sessao, email });
}

// ─── GET /api/biblioteca/acervo — Lista pública ────────────────────────────────
export async function handleBibliotecaAcervo(_request: Request, env: Env): Promise<Response> {
  const r = await sb(
    env,
    'biblioteca_acervo?ativo=eq.true&order=featured.desc,titulo.asc&select=slug,titulo,autor,ano_publicacao,genero,sinopse,capa_url,paginas_estimadas,idioma,featured'
  );
  const data = await r.json();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
  });
}

// ─── GET /api/biblioteca/minha — Slots + histórico ───────────────────────────
export async function handleBibliotecaMinha(request: Request, env: Env): Promise<Response> {
  const email = await sessaoLeitor(request, env);
  if (!email) return new Response('Unauthorized', { status: 401 });

  const [slotsR, histR] = await Promise.all([
    sb(env, `biblioteca_usuario_status?email=eq.${encodeURIComponent(email)}&order=slot_numero.asc`),
    sb(env, `biblioteca_historico?email=eq.${encodeURIComponent(email)}&order=concluido_em.desc&limit=20&select=slug,titulo,autor,concluido_em`),
  ]);

  const slots = (await slotsR.json()) as any[];
  const historico = await histR.json();

  return Response.json({ ok: true, slots, historico, slots_usados: slots.length, slots_max: 3 });
}

// ─── POST /api/biblioteca/selecionar ─────────────────────────────────────────
export async function handleBibliotecaSelecionar(request: Request, env: Env): Promise<Response> {
  const email = await sessaoLeitor(request, env);
  if (!email) return new Response('Unauthorized', { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }

  const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') : '';
  if (!slug || slug.length > 80) return Response.json({ ok: false, erro: 'slug_invalido' }, { status: 400 });

  const obraR = await sb(env, `biblioteca_acervo?slug=eq.${encodeURIComponent(slug)}&ativo=eq.true&select=id,titulo&limit=1`);
  const [obra] = (await obraR.json()) as any[];
  if (!obra) return Response.json({ ok: false, erro: 'obra_nao_encontrada' }, { status: 404 });

  const slotsR = await sb(env, `biblioteca_slots?email=eq.${encodeURIComponent(email)}&status=eq.lendo&select=slot_numero,acervo_id`);
  const ativos = (await slotsR.json()) as any[];

  if (ativos.length >= 3) {
    return Response.json({ ok: false, erro: 'slots_cheios', msg: 'Você tem 3 obras abertas. Conclua uma para liberar espaço.' }, { status: 409 });
  }

  if (ativos.some((s: any) => s.acervo_id === obra.id)) {
    return Response.json({ ok: false, erro: 'obra_ja_em_slot' }, { status: 409 });
  }

  const ocupados = ativos.map((s: any) => s.slot_numero as number);
  const slotLivre = ([1, 2, 3] as const).find(n => !ocupados.includes(n))!;

  const ins = await sb(env, 'biblioteca_slots', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ email, acervo_id: obra.id, slot_numero: slotLivre, status: 'lendo' }),
  });

  if (!ins.ok) return Response.json({ ok: false, erro: 'erro_bd' }, { status: 500 });

  return Response.json({ ok: true, slot: slotLivre, titulo: obra.titulo });
}

// ─── POST /api/biblioteca/marcar-lida ────────────────────────────────────────
export async function handleBibliotecaMarcarLida(request: Request, env: Env): Promise<Response> {
  const email = await sessaoLeitor(request, env);
  if (!email) return new Response('Unauthorized', { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false, erro: 'json_invalido' }, { status: 400 }); }

  const { slot_id } = body;
  if (!slot_id) return Response.json({ ok: false, erro: 'slot_id_obrigatorio' }, { status: 400 });

  const slotR = await sb(env, `biblioteca_slots?id=eq.${slot_id}&email=eq.${encodeURIComponent(email)}&status=eq.lendo&select=id,acervo_id&limit=1`);
  const [slot] = (await slotR.json()) as any[];
  if (!slot) return Response.json({ ok: false, erro: 'slot_nao_encontrado' }, { status: 404 });

  const obraR = await sb(env, `biblioteca_acervo?id=eq.${slot.acervo_id}&select=slug,titulo,autor&limit=1`);
  const [obra] = (await obraR.json()) as any[];

  await Promise.all([
    sb(env, `biblioteca_slots?id=eq.${slot_id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'lida', concluido_em: new Date().toISOString(), progresso_percentual: 100 }),
    }),
    sb(env, 'biblioteca_historico', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ email, acervo_id: slot.acervo_id, slug: obra?.slug, titulo: obra?.titulo, autor: obra?.autor }),
    }),
  ]);

  return Response.json({ ok: true, titulo: obra?.titulo ?? '', msg: `"${obra?.titulo}" concluída. Seu slot está livre.` });
}

// ─── POST /api/biblioteca/progresso ──────────────────────────────────────────
export async function handleBibliotecaProgresso(request: Request, env: Env): Promise<Response> {
  const email = await sessaoLeitor(request, env);
  if (!email) return new Response('Unauthorized', { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }

  const { slot_id, pagina_atual = 0, progresso_percentual = 0 } = body;
  if (!slot_id) return Response.json({ ok: false, erro: 'slot_id_obrigatorio' }, { status: 400 });
  const pag = Math.max(0, Math.floor(Number(pagina_atual) || 0));
  const prog = Math.max(0, Math.min(100, Number(progresso_percentual) || 0));

  await sb(env, `biblioteca_slots?id=eq.${slot_id}&email=eq.${encodeURIComponent(email)}`, {
    method: 'PATCH',
    body: JSON.stringify({ pagina_atual: pag, progresso_percentual: prog }),
  });

  return Response.json({ ok: true });
}

// ─── POST /api/biblioteca/ler — Obter URL temporária do EPUB ─────────────────
export async function handleBibliotecaLer(request: Request, env: Env): Promise<Response> {
  const email = await sessaoLeitor(request, env);
  if (!email) return new Response('Unauthorized', { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }

  const { slug } = body;
  if (!slug) return Response.json({ ok: false, erro: 'slug_obrigatorio' }, { status: 400 });

  const obraR = await sb(env, `biblioteca_acervo?slug=eq.${encodeURIComponent(slug)}&ativo=eq.true&select=id,epub_url&limit=1`);
  const [obra] = (await obraR.json()) as any[];
  if (!obra || !obra.epub_url) return Response.json({ ok: false, erro: 'obra_nao_encontrada' }, { status: 404 });

  const slotR = await sb(env, `biblioteca_slots?email=eq.${encodeURIComponent(email)}&acervo_id=eq.${obra.id}&status=eq.lendo&select=id&limit=1`);
  const [slot] = (await slotR.json()) as any[];
  if (!slot) return Response.json({ ok: false, erro: 'obra_nao_esta_em_slot', msg: 'Adicione esta obra aos seus slots antes de ler.' }, { status: 403 });

  // Gerar token de 1h para o stream
  const epubToken = await gerarToken(24);
  if (env.TT_KV) {
    await env.TT_KV.put(`bib:epub:${epubToken}`, JSON.stringify({ email, slug, epub_url: obra.epub_url, slot_id: slot.id }), { expirationTtl: 3600 });
  }

  const stream_url = `https://tres-trevo-api.al-kbhal.workers.dev/api/biblioteca/stream?t=${epubToken}`;
  return Response.json({ ok: true, stream_url, slot_id: slot.id, expira_em: new Date(Date.now() + 3_600_000).toISOString() });
}

// ─── GET /api/biblioteca/stream?t=TOKEN — Servir EPUB ────────────────────────
export async function handleBibliotecaStream(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const t = url.searchParams.get('t') ?? '';
  if (!t || !env.TT_KV) return new Response('Token inválido', { status: 401 });

  const raw = await env.TT_KV.get(`bib:epub:${t}`);
  if (!raw) return new Response('Token expirado — solicite novo acesso.', { status: 401 });

  const { epub_url } = JSON.parse(raw) as { epub_url: string; email: string; slug: string };

  // epub_url é URL externa (Gutenberg, etc.) → redirect direto (domínio público)
  if (epub_url.startsWith('http')) {
    return Response.redirect(epub_url, 302);
  }

  // epub_url é caminho no R2 privado (ex: "dom-casmurro.epub")
  if (!env.BIBLIOTECA_R2) return new Response('Storage não configurado', { status: 503 });

  const obj = await env.BIBLIOTECA_R2.get(epub_url);
  if (!obj) return new Response('EPUB não encontrado', { status: 404 });

  return new Response(obj.body, {
    headers: {
      'Content-Type': 'application/epub+zip',
      'Content-Disposition': 'inline',
      'Content-Length': String(obj.size),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    },
  });
}

// ─── Admin: acervo ────────────────────────────────────────────────────────────
export async function handleAdminBibliotecaAcervoGet(request: Request, env: Env): Promise<Response> {
  if (!(await verificarTokenAdmin(request, env))) return new Response('Unauthorized', { status: 401 });
  const r = await sb(env, 'biblioteca_acervo?order=featured.desc,titulo.asc&select=*');
  return Response.json(await r.json());
}

export async function handleAdminBibliotecaAcervoCreate(request: Request, env: Env): Promise<Response> {
  if (!(await verificarTokenAdmin(request, env))) return new Response('Unauthorized', { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }
  const r = await sb(env, 'biblioteca_acervo', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body) });
  return Response.json({ ok: r.ok, data: await r.json() });
}

export async function handleAdminBibliotecaAcervoUpdate(request: Request, env: Env, slug: string): Promise<Response> {
  if (!(await verificarTokenAdmin(request, env))) return new Response('Unauthorized', { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return Response.json({ ok: false }, { status: 400 }); }
  const r = await sb(env, `biblioteca_acervo?slug=eq.${encodeURIComponent(slug)}`, { method: 'PATCH', body: JSON.stringify(body) });
  return Response.json({ ok: r.ok });
}

export async function handleAdminBibliotecaAcervoDelete(request: Request, env: Env, slug: string): Promise<Response> {
  if (!(await verificarTokenAdmin(request, env))) return new Response('Unauthorized', { status: 401 });
  const r = await sb(env, `biblioteca_acervo?slug=eq.${encodeURIComponent(slug)}`, { method: 'PATCH', body: JSON.stringify({ ativo: false }) });
  return Response.json({ ok: r.ok });
}

export async function handleAdminBibliotecaStats(request: Request, env: Env): Promise<Response> {
  if (!(await verificarTokenAdmin(request, env))) return new Response('Unauthorized', { status: 401 });
  const [acR, slR, hiR] = await Promise.all([
    sb(env, 'biblioteca_acervo?ativo=eq.true&select=count', { headers: { Prefer: 'count=exact', Range: '0-0' } }),
    sb(env, 'biblioteca_slots?status=eq.lendo&select=count', { headers: { Prefer: 'count=exact', Range: '0-0' } }),
    sb(env, 'biblioteca_historico?select=count', { headers: { Prefer: 'count=exact', Range: '0-0' } }),
  ]);
  const n = (r: Response) => parseInt(r.headers.get('Content-Range')?.split('/')[1] ?? '0', 10);
  return Response.json({ ok: true, total_obras: n(acR), leituras_ativas: n(slR), leituras_concluidas: n(hiR), ts: new Date().toISOString() });
}
