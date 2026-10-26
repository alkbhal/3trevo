/**
 * admin-nfe.ts — Três Trevo Worker
 * Painel da NF-e (Bling):
 *   POST /api/admin/nfe/conectar   — devolve a URL para autorizar o app no Bling
 *   GET  /api/bling/callback       — o Bling volta aqui com ?code&state (sem login: o state prova a origem)
 *   GET  /api/admin/nfe/status     — conexão, chave de emissão e fila por status
 *   POST /api/admin/nfe/processar  — roda a fila agora, sem esperar o cron
 */

import type { Env } from '../types';
import { sb } from '../sb';
import { verificarToken } from './admin-catalog';
import { blingConfigurado, configNFe, consumirState, lerTokens, trocarCodigo, urlAutorizacao } from '../bling';
import { handleNFeEmissao } from '../cron/nfe-emissao';

const nao = () => Response.json({ ok: false, erro: 'unauthorized' }, { status: 401 });

export async function handleNFeConectar(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return nao();
  if (!blingConfigurado(env)) {
    return Response.json({ ok: false, erro: 'Defina BLING_CLIENT_ID e BLING_CLIENT_SECRET no Worker' }, { status: 503 });
  }
  return Response.json({ ok: true, url: await urlAutorizacao(env) });
}

function pagina(titulo: string, texto: string, status = 200): Response {
  const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${titulo}</title><body style="font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;color:#1a1a16">` +
    `<h1 style="font-size:20px">${titulo}</h1><p>${texto}</p></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function handleBlingCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code') ?? '';
  const state = url.searchParams.get('state') ?? '';
  if (!blingConfigurado(env)) return pagina('Bling não configurado', 'Faltam as credenciais do app no Worker.', 503);
  if (!code || !/^[\w.-]{1,512}$/.test(code) || !(await consumirState(env, state))) {
    return pagina('Link inválido ou expirado', 'Volte ao painel e clique em "Conectar Bling" de novo.', 400);
  }
  try {
    await trocarCodigo(env, code);
  } catch (e) {
    console.error('[bling] callback:', e);
    return pagina('O Bling recusou a conexão', 'Confira o app na Central de Extensões do Bling e tente de novo.', 502);
  }
  return pagina('Bling conectado', 'Pode fechar esta aba e voltar ao painel.');
}

export async function handleNFeStatus(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return nao();
  const tokens = await lerTokens(env);
  const r = await sb(env, 'notas_fiscais?select=status,error_message,updated_at&order=updated_at.desc&limit=500');
  const notas = ((await r.json().catch(() => [])) as any[]) || [];
  const fila: Record<string, number> = {};
  for (const n of Array.isArray(notas) ? notas : []) fila[n.status ?? '—'] = (fila[n.status ?? '—'] ?? 0) + 1;
  return Response.json({
    ok: true,
    credenciais: blingConfigurado(env),
    conectado: Boolean(tokens),
    emissao_ligada: env.NFE_ENABLED === 'true',
    natureza_definida: Boolean(configNFe(env)),
    fila,
    erros: (Array.isArray(notas) ? notas : []).filter((n) => n.status === 'erro').slice(0, 10),
  });
}

export async function handleNFeProcessar(request: Request, env: Env): Promise<Response> {
  if (!(await verificarToken(request, env))) return nao();
  return Response.json({ ok: true, resumo: await handleNFeEmissao(env) });
}
