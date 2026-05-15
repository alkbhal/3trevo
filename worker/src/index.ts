interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  ADMIN_SENHA?: string;
  RIFEI_WEBHOOK_SECRET?: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token',
  'Access-Control-Max-Age': '86400',
};

function corsResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

function errorResponse(message: string, status = 400): Response {
  return corsResponse({ error: message, ok: false }, status);
}

function sbFetch(env: Env, path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...((opts.headers as Record<string, string>) || {}),
    },
  });
}

async function sbGet(env: Env, path: string): Promise<any[]> {
  const r = await sbFetch(env, path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function sbPost(env: Env, path: string, body: unknown, prefer = 'return=representation'): Promise<any> {
  const r = await sbFetch(env, path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Prefer: prefer },
  });
  if (!r.ok) throw new Error(await r.text());
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

async function sbPatch(env: Env, path: string, body: unknown): Promise<{ ok: true }> {
  const r = await sbFetch(env, path, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { Prefer: 'return=minimal' },
  });
  if (!r.ok) throw new Error(await r.text());
  return { ok: true };
}

async function sbDelete(env: Env, path: string): Promise<void> {
  const r = await sbFetch(env, path, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  if (!r.ok) throw new Error(await r.text());
}

async function validarSessao(env: Env, req: Request): Promise<boolean> {
  const token =
    req.headers.get('X-Session-Token') ||
    req.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return false;
  try {
    const rows = await sbGet(
      env,
      `admin_sessoes?token=eq.${token}&ativa=eq.true&expira_em=gt.${new Date().toISOString()}&select=token`,
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function validarJwtSupabase(env: Env, jwt: string): Promise<boolean> {
  try {
    const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) return false;
    const user = await r.json() as { email?: string };
    if (!user.email) return false;
    const rows = await sbGet(env, `admin_users?email=eq.${encodeURIComponent(user.email)}&ativo=eq.true&select=email`);
    return rows.length > 0;
  } catch { return false; }
}

async function requerAuth(env: Env, req: Request): Promise<Response | null> {
  const bearer = req.headers.get('Authorization')?.replace('Bearer ', '');
  if (bearer && bearer.startsWith('eyJ')) {
    const ok = await validarJwtSupabase(env, bearer);
    if (ok) return null;
  }
  const ok = await validarSessao(env, req);
  if (!ok) return errorResponse('Não autorizado. Faça login.', 401);
  return null;
}

async function registrarAuditoria(
  env: Env,
  tabela: string,
  operacao: string,
  registroId: string | number | null,
  dadosAntes: unknown = null,
  dadosDepois: unknown = null,
): Promise<void> {
  try {
    await sbPost(
      env,
      'auditoria',
      { tabela, operacao, registro_id: registroId, dados_antes: dadosAntes, dados_depois: dadosDepois, usuario: 'admin' },
      'return=minimal',
    );
  } catch (e) {
    console.error('Erro ao registrar auditoria:', e);
  }
}

// FIX: lê a senha da tabela config (prioridade) e usa env.ADMIN_SENHA só como fallback.
// Antes, o worker só verificava env.ADMIN_SENHA enquanto o painel admin salvava em config.admin_senha —
// os dois nunca se conectavam, causando falha em todo login.
async function handleLogin(env: Env, req: Request): Promise<Response> {
  const body = await req.json<{ senha?: string }>();
  if (!body.senha) return errorResponse('Senha obrigatória.');

  let senhaCorreta: string | undefined;
  try {
    const rows = await sbGet(env, 'config?chave=eq.admin_senha&select=valor');
    if (rows.length > 0 && rows[0].valor != null) {
      senhaCorreta = typeof rows[0].valor === 'string' ? rows[0].valor : String(rows[0].valor);
    }
  } catch {
    // fallback abaixo
  }
  if (!senhaCorreta) senhaCorreta = env.ADMIN_SENHA;

  if (!senhaCorreta || body.senha !== senhaCorreta) {
    console.warn('Tentativa de login falha - IP:', req.headers.get('CF-Connecting-IP'));
    return errorResponse('Senha incorreta.', 401);
  }

  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const sessoes = await sbPost(env, 'admin_sessoes', { ip });
  const sessao = Array.isArray(sessoes) ? sessoes[0] : sessoes;
  return corsResponse({
    ok: true,
    token: sessao.token,
    expira_em: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  });
}

async function handleLogout(env: Env, req: Request): Promise<Response> {
  const token = req.headers.get('X-Session-Token');
  if (token) await sbPatch(env, `admin_sessoes?token=eq.${token}`, { ativa: false });
  return corsResponse({ ok: true });
}

async function handleGetCatalogo(env: Env): Promise<Response> {
  const rows = await sbGet(env, 'catalogo?order=ordem.asc');
  return corsResponse(rows);
}

async function handlePostCatalogo(env: Env, req: Request): Promise<Response> {
  const body = await req.json();
  const resultado = await sbPost(env, 'catalogo', body);
  await registrarAuditoria(env, 'catalogo', 'INSERT', (body as any).slug, null, body);
  return corsResponse(resultado, 201);
}

async function handlePutCatalogo(env: Env, req: Request, slug: string): Promise<Response> {
  const body = await req.json();
  const anterior = await sbGet(env, `catalogo?slug=eq.${slug}`);
  await sbPatch(env, `catalogo?slug=eq.${slug}`, body);
  await registrarAuditoria(env, 'catalogo', 'UPDATE', slug, anterior[0] || null, body);
  return corsResponse({ ok: true });
}

async function handleDeleteCatalogo(env: Env, slug: string): Promise<Response> {
  const anterior = await sbGet(env, `catalogo?slug=eq.${slug}`);
  await sbDelete(env, `catalogo?slug=eq.${slug}`);
  await registrarAuditoria(env, 'catalogo', 'DELETE', slug, anterior[0] || null, null);
  return corsResponse({ ok: true });
}

async function handleGetPremios(env: Env): Promise<Response> {
  const rows = await sbGet(env, 'premios?order=posicao.asc');
  return corsResponse(rows);
}

async function handlePostPremio(env: Env, req: Request): Promise<Response> {
  const body = await req.json();
  const resultado = await sbPost(env, 'premios', body);
  await registrarAuditoria(env, 'premios', 'INSERT', 'novo', null, body);
  return corsResponse(resultado, 201);
}

async function handlePutPremio(env: Env, req: Request, id: string): Promise<Response> {
  const body = await req.json();
  const anterior = await sbGet(env, `premios?id=eq.${id}`);
  await sbPatch(env, `premios?id=eq.${id}`, body);
  await registrarAuditoria(env, 'premios', 'UPDATE', id, anterior[0] || null, body);
  return corsResponse({ ok: true });
}

async function handleDeletePremio(env: Env, id: string): Promise<Response> {
  const anterior = await sbGet(env, `premios?id=eq.${id}`);
  await sbDelete(env, `premios?id=eq.${id}`);
  await registrarAuditoria(env, 'premios', 'DELETE', id, anterior[0] || null, null);
  return corsResponse({ ok: true });
}

async function handleGetConfig(env: Env): Promise<Response> {
  const rows = await sbGet(env, 'config?select=chave,valor,atualizado_em');
  return corsResponse(rows);
}

// FIX: operacao "UPSERT" trocada por "UPDATE" — a tabela auditoria tem CHECK constraint
// que só aceita INSERT/UPDATE/DELETE, causando erro silencioso a cada save de config.
async function handlePostConfig(env: Env, req: Request): Promise<Response> {
  const body = await req.json<{ chave?: string; valor?: unknown }>();
  if (!body.chave) return errorResponse('Campo "chave" obrigatório.');
  const r = await sbFetch(env, 'config', {
    method: 'POST',
    body: JSON.stringify({ ...body, atualizado_em: new Date().toISOString() }),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  });
  if (!r.ok) throw new Error(await r.text());
  await registrarAuditoria(env, 'config', 'UPDATE', body.chave, null, body.valor);
  return corsResponse({ ok: true });
}

async function handleGetDepoimentos(env: Env): Promise<Response> {
  const rows = await sbGet(env, 'depoimentos?order=enviado_em.desc&limit=100');
  return corsResponse(rows);
}

async function handlePatchDepoimento(env: Env, req: Request, id: string): Promise<Response> {
  const body = await req.json();
  await sbPatch(env, `depoimentos?id=eq.${id}`, body);
  await registrarAuditoria(env, 'depoimentos', 'UPDATE', id, null, body);
  return corsResponse({ ok: true });
}

async function handleDeleteDepoimento(env: Env, id: string): Promise<Response> {
  await sbDelete(env, `depoimentos?id=eq.${id}`);
  await registrarAuditoria(env, 'depoimentos', 'DELETE', id, null, null);
  return corsResponse({ ok: true });
}

async function handlePublicCatalogo(env: Env): Promise<Response> {
  const rows = await sbGet(
    env,
    'catalogo?ativo=eq.true&order=ordem.asc&select=slug,titulo,titulo_en,titulo_es,descricao,descricao_en,descricao_es,genero,genero_pt,genero_en,genero_es,autor,preco,cotas,rifei_url,utm_campaign,bg_color,ordem',
  );
  return corsResponse(rows);
}

async function handlePublicPremios(env: Env): Promise<Response> {
  const rows = await sbGet(
    env,
    'premios?ativo=eq.true&order=posicao.asc&select=posicao,descricao_pt,descricao_en,descricao_es,conectado_pt,conectado_en,conectado_es',
  );
  return corsResponse(rows);
}

async function handlePublicConfig(env: Env, chave: string): Promise<Response> {
  const BLOQUEADAS = ['admin_senha', 'publicado'];
  if (BLOQUEADAS.includes(chave)) return errorResponse('Não autorizado.', 403);
  const rows = await sbGet(env, `config?chave=eq.${chave}&select=chave,valor`);
  if (!rows.length) return errorResponse('Chave não encontrada.', 404);
  return corsResponse(rows[0]);
}

async function handleWebhookRifei(env: Env, req: Request): Promise<Response> {
  const secret = req.headers.get('X-Webhook-Secret');
  if (secret !== env.RIFEI_WEBHOOK_SECRET) {
    console.warn('Webhook Rifei: secret inválido');
    return errorResponse('Não autorizado.', 401);
  }
  const body = await req.json<Record<string, any>>();
  const nome = body.nome || body.customer_name || 'Desconhecido';
  const email = body.email || body.customer_email || '';
  const telefone = body.telefone || body.customer_phone || '';
  const ebook_slug = body.ebook_slug || body.product_slug || '';
  const valor_pago = body.valor_pago ?? body.amount ?? 0;
  const id_externo = body.id_externo || body.order_id || '';

  if (!email || !ebook_slug) {
    console.error('Webhook Rifei: campos obrigatórios ausentes', { email, ebook_slug });
    return errorResponse('Campos obrigatórios: email e ebook_slug.', 400);
  }

  const rpc = await sbFetch(env, 'rpc/upsert_cliente_pedido', {
    method: 'POST',
    body: JSON.stringify({ p_nome: nome, p_email: email, p_telefone: telefone, p_ebook_slug: ebook_slug, p_valor_pago: valor_pago, p_id_externo: id_externo }),
  });
  const resultado = await rpc.json<any>();
  if (!resultado.ok) {
    console.error('Erro ao registrar pedido:', resultado.erro);
    return errorResponse('Erro ao registrar pedido: ' + resultado.erro, 500);
  }
  console.log('Pedido registrado:', JSON.stringify(resultado));
  await registrarAuditoria(env, 'pedidos', 'INSERT', id_externo, null, { email, ebook_slug, valor_pago, novo: resultado.novo_pedido });
  return corsResponse({
    ok: true,
    novo_pedido: resultado.novo_pedido,
    pedido_id: resultado.pedido_id,
    mensagem: resultado.novo_pedido ? 'Pedido registrado com sucesso.' : 'Pedido já existia — ignorado (idempotência).',
  });
}

async function handleLgpd(env: Env, req: Request): Promise<Response> {
  const body = await req.json<{ email?: string; tipo?: string; descricao?: string }>();
  if (!body.email || !body.tipo) return errorResponse('Email e tipo são obrigatórios.');
  const TIPOS_VALIDOS = ['exclusao', 'portabilidade', 'retificacao', 'oposicao'];
  if (!TIPOS_VALIDOS.includes(body.tipo)) return errorResponse('Tipo inválido. Use: ' + TIPOS_VALIDOS.join(', '));
  await sbPost(env, 'lgpd_solicitacoes', { email: body.email, tipo: body.tipo, descricao: body.descricao || '' }, 'return=minimal');
  return corsResponse({ ok: true, mensagem: 'Solicitação registrada. Responderemos em até 15 dias úteis conforme LGPD.' }, 201);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });

    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    try {
      // Rotas públicas
      if (path === '/api/public/catalogo' && method === 'GET') return handlePublicCatalogo(env);
      if (path === '/api/public/premios' && method === 'GET') return handlePublicPremios(env);
      if (path.startsWith('/api/public/config/') && method === 'GET') {
        return handlePublicConfig(env, path.split('/').pop() || '');
      }
      if (path === '/api/lgpd' && method === 'POST') return handleLgpd(env, req);
      if (path === '/api/webhook/rifei' && method === 'POST') return handleWebhookRifei(env, req);

      // Auth
      if (path === '/api/admin/login' && method === 'POST') return handleLogin(env, req);
      if (path === '/api/admin/logout' && method === 'POST') return handleLogout(env, req);

      // Rotas protegidas
      const authErr = await requerAuth(env, req);
      if (authErr) return authErr;

      if (path === '/api/admin/catalogo') {
        if (method === 'GET') return handleGetCatalogo(env);
        if (method === 'POST') return handlePostCatalogo(env, req);
      }
      const catalogoMatch = path.match(/^\/api\/admin\/catalogo\/([^/]+)$/);
      if (catalogoMatch) {
        const slug = catalogoMatch[1];
        if (method === 'PUT') return handlePutCatalogo(env, req, slug);
        if (method === 'DELETE') return handleDeleteCatalogo(env, slug);
      }

      if (path === '/api/admin/premios') {
        if (method === 'GET') return handleGetPremios(env);
        if (method === 'POST') return handlePostPremio(env, req);
      }
      const premioMatch = path.match(/^\/api\/admin\/premios\/(\d+)$/);
      if (premioMatch) {
        const id = premioMatch[1];
        if (method === 'PUT') return handlePutPremio(env, req, id);
        if (method === 'DELETE') return handleDeletePremio(env, id);
      }

      if (path === '/api/admin/config') {
        if (method === 'GET') return handleGetConfig(env);
        if (method === 'POST') return handlePostConfig(env, req);
      }

      if (path === '/api/admin/depoimentos') {
        if (method === 'GET') return handleGetDepoimentos(env);
      }
      const depMatch = path.match(/^\/api\/admin\/depoimentos\/([^/]+)$/);
      if (depMatch) {
        const id = depMatch[1];
        if (method === 'PATCH') return handlePatchDepoimento(env, req, id);
        if (method === 'DELETE') return handleDeleteDepoimento(env, id);
      }

      if (path === '/api/health') return corsResponse({ ok: true, ts: new Date().toISOString() });

      return errorResponse('Rota não encontrada.', 404);
    } catch (err) {
      console.error('Erro interno:', err);
      return errorResponse('Erro interno do servidor.', 500);
    }
  },
};
