/**
 * nema.ts — Três Trevo Worker
 * Nema (N$): a moeda da editora.
 *   GET  /api/nema/saldo        — saldo do cliente logado (Authorization: Bearer <token do Supabase>)
 *   GET  /api/nema/regulamento  — versão vigente do Regulamento Geral (e, logado, se já aceitou)
 *   POST /api/nema/aceite       — registra o aceite da versão vigente { versao, origem }
 *   GET  /api/nema/extrato      — histórico do cliente logado (consulta livre, sem exigir aceite)
 *
 * As regras (taxa, valor de 1 Nema, teto, carência) moram no banco, em
 * public.nema_parametros e nas funções nema_* (supabase/nema.sql). Aqui o worker
 * só identifica o cliente e chama essas funções; nenhum cálculo de saldo é feito em TS.
 */

import { z } from 'zod';
import type { Env } from '../types';
import { sb } from '../sb';

export interface UsuarioNema { id: string; email: string }

export function extrairBearer(request: Request): string | null {
  const auth = request.headers.get('Authorization') ?? '';
  const m = auth.match(/^Bearer\s+([A-Za-z0-9._-]{20,4096})$/);
  return m ? m[1] : null;
}

/** Valida o token de sessão do cliente no Supabase Auth e devolve quem é. */
export async function usuarioDoToken(request: Request, env: Env): Promise<UsuarioNema | null> {
  const token = extrairBearer(request);
  if (!token) return null;
  try {
    const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return null;
    const u = (await resp.json()) as any;
    if (typeof u?.id !== 'string' || typeof u?.email !== 'string') return null;
    return { id: u.id, email: u.email };
  } catch {
    return null;
  }
}

async function rpc<T = any>(env: Env, nome: string, args: Record<string, unknown>): Promise<T | null> {
  const resp = await sb(env, `rpc/${nome}`, { method: 'POST', body: JSON.stringify(args) });
  if (!resp.ok) {
    console.error(`[nema] rpc ${nome} falhou:`, resp.status, await resp.text());
    return null;
  }
  return (await resp.json()) as T;
}

export interface Saldo { disponivel: number; pendente: number; reservado: number }

export async function saldoNema(env: Env, userId: string): Promise<Saldo | null> {
  const r = await rpc<any[]>(env, 'nema_saldo', { p_user: userId });
  const s = Array.isArray(r) ? r[0] : null;
  if (!s) return null;
  return { disponivel: Number(s.disponivel), pendente: Number(s.pendente), reservado: Number(s.reservado) };
}

export async function valorNemaReais(env: Env): Promise<number> {
  const r = await rpc<number>(env, 'nema_param', { p_chave: 'valor_nema_reais' });
  return typeof r === 'number' ? r : Number(r ?? 0.5);
}

export interface Reserva { quantidade: number; desconto: number; reserva_ref: string | null }

export async function reservarNema(env: Env, userId: string, preco: number): Promise<Reserva | null> {
  const r = await rpc<any>(env, 'nema_reservar', { p_user: userId, p_preco: preco });
  if (!r?.ok) return null;
  return { quantidade: Number(r.quantidade ?? 0), desconto: Number(r.desconto ?? 0), reserva_ref: r.reserva_ref ?? null };
}

export async function cancelarReservaNema(env: Env, ref: string): Promise<void> {
  await rpc(env, 'nema_cancelar_reserva', { p_ref: ref });
}

export async function confirmarResgateNema(env: Env, ref: string, mpPaymentId: string, purchaseId: string | null): Promise<void> {
  await rpc(env, 'nema_confirmar_resgate', { p_ref: ref, p_mp_payment: mpPaymentId, p_purchase: purchaseId });
}

export async function creditarCompraNema(env: Env, userId: string, purchaseId: string, valorPago: number): Promise<number> {
  const r = await rpc<any>(env, 'nema_creditar_compra', { p_user: userId, p_purchase: purchaseId, p_valor_pago: valorPago });
  return Number(r?.quantidade ?? 0);
}

export async function estornarCompraNema(env: Env, purchaseId: string): Promise<void> {
  await rpc(env, 'nema_estornar_compra', { p_purchase: purchaseId });
}

/** O Mercado Pago devolve as chaves de metadata em snake_case; aceita só um UUID. */
export function reservaDoMetadata(metadata: unknown): string | null {
  const ref = (metadata as any)?.nema_reserva;
  return typeof ref === 'string' && /^[0-9a-f-]{36}$/i.test(ref) ? ref : null;
}

// ─── Regulamento Geral e aceite (supabase/nema_v1_aceite.sql) ────────────────
// Enquanto a migração não estiver aplicada, as funções não existem: tudo responde
// "sem regulamento vigente" e "não precisa aceitar", que é o comportamento de antes.

export interface Regulamento { versao: number; titulo: string; url: string; vigente_desde: string }

export async function regulamentoVigente(env: Env): Promise<Regulamento | null> {
  const v = await rpc<number | null>(env, 'nema_versao_vigente', {});
  if (typeof v !== 'number') return null;
  const r = await sb(env, `nema_regulamentos?versao=eq.${v}&select=versao,titulo,url,vigente_desde`);
  if (!r.ok) return null;
  const linhas = (await r.json().catch(() => [])) as Regulamento[];
  return Array.isArray(linhas) && linhas[0] ? linhas[0] : null;
}

/** true quando o uso do saldo está bloqueado até o leitor aceitar a versão vigente. */
export async function precisaAceite(env: Env, userId: string): Promise<boolean> {
  const exige = await rpc<number | null>(env, 'nema_param', { p_chave: 'exige_aceite' });
  if (Number(exige ?? 0) !== 1) return false;
  const ok = await rpc<boolean | null>(env, 'nema_aceite_ok', { p_user: userId });
  return ok === false;
}

export const aceiteSchema = z.object({
  versao: z.number().int().positive(),
  origem: z.enum(['area_cliente', 'checkout']),
});

export async function handleNemaRegulamento(request: Request, env: Env): Promise<Response> {
  const vigente = await regulamentoVigente(env);
  const user = extrairBearer(request) ? await usuarioDoToken(request, env) : null;
  let aceito: boolean | undefined;
  if (user && vigente) aceito = (await rpc<boolean | null>(env, 'nema_aceite_ok', { p_user: user.id })) === true;
  return Response.json({ ok: true, vigente, ...(aceito === undefined ? {} : { aceito }) });
}

export async function handleNemaAceite(request: Request, env: Env): Promise<Response> {
  const user = await usuarioDoToken(request, env);
  if (!user) return Response.json({ ok: false, erro: 'login_necessario' }, { status: 401 });
  const corpo = aceiteSchema.safeParse(await request.json().catch(() => null));
  if (!corpo.success) return Response.json({ ok: false, erro: 'dados_invalidos' }, { status: 400 });
  const r = await rpc<any>(env, 'nema_aceitar', { p_user: user.id, p_versao: corpo.data.versao, p_origem: corpo.data.origem });
  if (!r) return Response.json({ ok: false, erro: 'aceite_indisponivel' }, { status: 503 });
  if (!r.ok) return Response.json({ ok: false, erro: r.erro ?? 'aceite_recusado', vigente: r.vigente ?? null }, { status: 409 });
  return Response.json({ ok: true, versao: r.versao });
}

export async function handleNemaExtrato(request: Request, env: Env): Promise<Response> {
  const user = await usuarioDoToken(request, env);
  if (!user) return Response.json({ ok: false, erro: 'login_necessario' }, { status: 401 });
  const linhas = await rpc<any[]>(env, 'nema_extrato', { p_user: user.id, p_limite: 100 });
  if (!Array.isArray(linhas)) return Response.json({ ok: false, erro: 'extrato_indisponivel' }, { status: 503 });
  return Response.json({ ok: true, movimentos: linhas });
}

export async function handleNemaSaldo(request: Request, env: Env): Promise<Response> {
  const user = await usuarioDoToken(request, env);
  if (!user) return Response.json({ ok: false, erro: 'login_necessario' }, { status: 401 });
  const [saldo, valor, precisa] = await Promise.all([saldoNema(env, user.id), valorNemaReais(env), precisaAceite(env, user.id)]);
  if (!saldo) return Response.json({ ok: false, erro: 'saldo_indisponivel' }, { status: 503 });
  return Response.json({
    ok: true,
    ...saldo,
    precisa_aceite: precisa,
    valor_nema_reais: valor,
    disponivel_em_reais: Math.round(saldo.disponivel * valor * 100) / 100,
  });
}
