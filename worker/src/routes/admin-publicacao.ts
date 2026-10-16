/**
 * admin-publicacao.ts — Três Trevo Worker
 * Painel do dono para as propostas de publicação (spec publicação por idioma v2).
 *
 * GET  /api/admin/publicacao                      — propostas com evidência (R6)
 * POST /api/admin/publicacao/:id/aprovar  {preco} — aprova AQUELE preço e publica (D3, R6)
 * POST /api/admin/publicacao/:id/recusar  {motivo}
 * POST /api/admin/publicacao/:id/despublicar {motivo?} — imediato (R9)
 *
 * Cada decisão vira registro imutável (R7). Todas as rotas exigem sessão admin.
 */

import { z } from 'zod';
import type { Env } from '../types';
import { verificarToken } from './admin-catalog';
import { emailDono } from '../notify';
import { bancoSupabase, type Banco } from '../publicacao/banco';
import { registroDe } from '../publicacao/proposta';

/** D3: depois de tantas aprovações sem falha crítica, reavaliar a automação (só aviso). */
export const APROVACOES_PARA_REAVALIAR = 10;
const DECISOR = 'dono (painel admin)';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const aprovarSchema = z.object({ preco: z.number().positive().max(10000) });
const recusarSchema = z.object({ motivo: z.string().trim().min(3).max(500) });
const despublicarSchema = z.object({ motivo: z.string().trim().max(500).optional() });

export interface DependenciasAdmin {
  banco?: Banco;
  avisar?: (assunto: string, texto: string) => Promise<void>;
}

const erro = (codigo: string, status: number, extra: Record<string, unknown> = {}) =>
  Response.json({ ok: false, erro: codigo, ...extra }, { status });

async function corpo<T>(request: Request, schema: z.ZodType<T>): Promise<T | Response> {
  let bruto: unknown;
  try { bruto = await request.json(); } catch { return erro('json_invalido', 400); }
  const r = schema.safeParse(bruto);
  if (!r.success) return erro('validacao', 400, { detalhe: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
  return r.data;
}

export async function handleAdminPublicacaoLista(request: Request, env: Env, dep: DependenciasAdmin = {}): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });
  try {
    return Response.json(await (dep.banco ?? bancoSupabase(env)).listarPropostas());
  } catch (err) {
    console.error('[admin-publicacao] lista falhou:', err);
    return erro('supabase_error', 502);
  }
}

export async function handleAdminPublicacaoAcao(
  request: Request, env: Env, forgeId: string, acao: string, dep: DependenciasAdmin = {},
): Promise<Response> {
  if (!(await verificarToken(request, env))) return new Response('Unauthorized', { status: 401 });
  if (!UUID.test(forgeId)) return erro('id_invalido', 400);
  const banco = dep.banco ?? bancoSupabase(env);
  const avisar = dep.avisar ?? ((a: string, t: string) => emailDono(env, a, t));

  try {
    if (acao === 'aprovar') {
      const b = await corpo(request, aprovarSchema);
      if (b instanceof Response) return b;
      // Atômico: só publica se ainda está pronta E com o preço que o dono viu (R6).
      const p = await banco.mudarEstado(forgeId, 'pronto_para_aprovacao', 'publicado', b.preco);
      if (!p) return erro('proposta_mudou', 409, { detalhe: 'não está pronta para aprovação ou o preço mudou; recarregue o painel' });
      try {
        await banco.publicarNaLoja(p);
      } catch (err) {
        await banco.mudarEstado(forgeId, 'publicado', 'pronto_para_aprovacao');
        throw err;
      }
      await banco.registrar(registroDe(p, 'aprovacao', DECISOR));
      await banco.registrar(registroDe(p, 'publicacao', DECISOR));
      await avisarReavaliacao(banco, p.forge_project_id, avisar);
      return Response.json({ ok: true, estado: p.estado, slug: p.slug, preco: p.preco });
    }

    if (acao === 'recusar') {
      const b = await corpo(request, recusarSchema);
      if (b instanceof Response) return b;
      const p = (await banco.mudarEstado(forgeId, 'pronto_para_aprovacao', 'recusado'))
        ?? (await banco.mudarEstado(forgeId, 'rascunho', 'recusado'));
      if (!p) return erro('estado_invalido', 409, { detalhe: 'só proposta ou rascunho pode ser recusado' });
      await banco.registrar(registroDe(p, 'recusa', DECISOR, b.motivo));
      return Response.json({ ok: true, estado: p.estado });
    }

    if (acao === 'despublicar') {
      const b = await corpo(request, despublicarSchema);
      if (b instanceof Response) return b;
      const atual = await banco.proposta(forgeId);
      if (!atual || atual.estado !== 'publicado') return erro('estado_invalido', 409, { detalhe: 'só livro publicado pode ser despublicado' });
      const motivo = b.motivo || 'despublicado pelo dono';
      // Primeiro tira da vitrine (o que importa é sair do ar já), depois o estado.
      await banco.despublicarNaLoja(atual.slug, motivo);
      const p = await banco.mudarEstado(forgeId, 'publicado', 'despublicado');
      await banco.registrar(registroDe(p ?? { ...atual, estado: 'despublicado' }, 'despublicacao', DECISOR, motivo));
      return Response.json({ ok: true, estado: 'despublicado' });
    }

    return erro('acao_desconhecida', 404);
  } catch (err) {
    console.error(`[admin-publicacao] ${acao} ${forgeId} falhou:`, err);
    return erro('supabase_error', 502);
  }
}

/**
 * D3: ao chegar a 10 livros aprovados sem falha crítica, avisa o dono UMA vez para
 * reavaliar a automação. Não liga automação nenhuma: isso é nova versão da spec.
 * Falha crítica, até o dono definir outra coisa: livro que ele precisou tirar do ar.
 */
async function avisarReavaliacao(banco: Banco, forgeId: string, avisar: (a: string, t: string) => Promise<void>): Promise<void> {
  if ((await banco.projetosComEvento('aviso_reavaliacao')).length) return;
  const falhas = new Set(await banco.projetosComEvento('despublicacao'));
  const bons = new Set((await banco.projetosComEvento('aprovacao')).filter((id) => !falhas.has(id)));
  if (bons.size < APROVACOES_PARA_REAVALIAR) return;
  const p = await banco.proposta(forgeId);
  if (!p) return;
  const texto = `${APROVACOES_PARA_REAVALIAR} livros aprovados sem falha crítica. Hora de reavaliar a publicação automática (D3). Nada muda até uma nova versão da spec.`;
  await banco.registrar(registroDe(p, 'aviso_reavaliacao', 'sistema', texto));
  await avisar('Reavaliar a publicação automática', texto).catch((e) => console.error('[admin-publicacao] aviso D3 falhou:', e));
}
