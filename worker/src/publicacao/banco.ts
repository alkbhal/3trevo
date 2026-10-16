/**
 * publicacao/banco.ts — Três Trevo Worker
 * Acesso a dados da publicação por idioma. A interface deixa os handlers testáveis
 * com banco em memória; a implementação real fala com o Supabase (PostgREST).
 * Tabelas em supabase/publicacao-idioma.sql.
 */

import type { Env } from '../types';
import { sb } from '../sb';
import type { Cotacao } from '../guardiao/engine';
import { cotasPorPreco } from '../routes/admin-catalog';
import type { Estado, Parametro, Proposta, Registro } from './proposta';

export interface Banco {
  proposta(forgeProjectId: string): Promise<Proposta | null>;
  listarPropostas(): Promise<Proposta[]>;
  /**
   * Cria a proposta ou substitui a atual — nunca por cima de publicado/despublicado,
   * nem numa corrida com a aprovação (R9, N5). Devolve false se não gravou.
   */
  salvarProposta(p: Proposta): Promise<boolean>;
  /**
   * Troca de estado atômica: só muda se o estado atual for `de` (e o preço for
   * `precoEsperado`, quando dado). Devolve a linha nova, ou null se não mudou.
   */
  mudarEstado(forgeProjectId: string, de: Estado, para: Estado, precoEsperado?: number): Promise<Proposta | null>;
  /** Acrescenta ao registro. A tabela recusa UPDATE e DELETE (R7/N8). */
  registrar(r: Registro): Promise<void>;
  /** forge_project_id de cada registro com esse evento (com repetição). */
  projetosComEvento(evento: Registro['evento']): Promise<string[]>;
  parametros(): Promise<Parametro[]>;
  gravarCotacao(moeda: string, c: Cotacao): Promise<void>;
  /** Produto ativo no catálogo (vitrine/checkout) e em products (entrega). */
  publicarNaLoja(p: Proposta): Promise<void>;
  despublicarNaLoja(slug: string, motivo: string): Promise<void>;
}

async function exigirOk(r: Response, onde: string): Promise<Response> {
  if (!r.ok) throw new Error(`${onde}: supabase ${r.status} ${await r.text().catch(() => '')}`);
  return r;
}

const id = (v: string) => encodeURIComponent(v);
const UPSERT = { Prefer: 'resolution=merge-duplicates,return=minimal' };

export function bancoSupabase(env: Env): Banco {
  return {
    async proposta(forgeProjectId) {
      const r = await exigirOk(await sb(env, `publicacao_propostas?forge_project_id=eq.${id(forgeProjectId)}&select=*`), 'proposta');
      const linhas = (await r.json()) as Proposta[];
      return linhas[0] ?? null;
    },
    async listarPropostas() {
      const r = await exigirOk(await sb(env, 'publicacao_propostas?select=*&order=atualizado_em.desc&limit=200'), 'listar');
      return (await r.json()) as Proposta[];
    },
    async salvarProposta(p) {
      const corpo = JSON.stringify({ ...p, atualizado_em: new Date().toISOString() });
      // O filtro de estado faz a troca atômica no banco: o que o dono decidiu não é sobrescrito.
      const r = await exigirOk(await sb(env, `publicacao_propostas?forge_project_id=eq.${id(p.forge_project_id)}&estado=not.in.(publicado,despublicado)`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: corpo,
      }), 'atualizar proposta');
      if (((await r.json()) as unknown[]).length) return true;
      const novo = await sb(env, 'publicacao_propostas', { method: 'POST', body: corpo });
      if (novo.status === 409) return false; // já existe e está fixa
      await exigirOk(novo, 'criar proposta');
      return true;
    },
    async mudarEstado(forgeProjectId, de, para, precoEsperado) {
      const filtroPreco = precoEsperado === undefined ? '' : `&preco=eq.${precoEsperado}`;
      const r = await exigirOk(await sb(env, `publicacao_propostas?forge_project_id=eq.${id(forgeProjectId)}&estado=eq.${de}${filtroPreco}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ estado: para, atualizado_em: new Date().toISOString() }),
      }), 'mudar estado');
      const linhas = (await r.json()) as Proposta[];
      return linhas[0] ?? null;
    },
    async registrar(reg) {
      await exigirOk(await sb(env, 'publicacao_registros', { method: 'POST', body: JSON.stringify(reg) }), 'registrar');
    },
    async projetosComEvento(evento) {
      const r = await exigirOk(await sb(env, `publicacao_registros?evento=eq.${evento}&select=forge_project_id`), 'eventos');
      return ((await r.json()) as Array<{ forge_project_id: string }>).map((l) => l.forge_project_id);
    },
    async parametros() {
      const r = await exigirOk(await sb(env, 'precificacao_parametros?select=chave,valor,estado,fonte'), 'parametros');
      return (await r.json()) as Parametro[];
    },
    async gravarCotacao(moeda, c) {
      await exigirOk(await sb(env, 'cotacoes_ptax?on_conflict=moeda,data', {
        method: 'POST', headers: UPSERT, body: JSON.stringify({ moeda, data: c.data, taxa: c.taxa, fonte: c.fonte }),
      }), 'cotacao');
    },
    async publicarNaLoja(p) {
      if (p.preco === null) throw new Error('publicar sem preço');
      const cotas = cotasPorPreco(p.preco);
      await exigirOk(await sb(env, 'catalogo?on_conflict=slug', {
        method: 'POST', headers: UPSERT,
        body: JSON.stringify({
          slug: p.slug, titulo: p.titulo, descricao: p.descricao, preco: p.preco, cotas, ativo: true,
          motivo_inativo: null, idioma: p.idioma, forge_project_id: p.forge_project_id, utm_campaign: p.slug, ordem: 99,
        }),
      }), 'publicar catalogo');
      await exigirOk(await sb(env, 'products?on_conflict=slug', {
        method: 'POST', headers: UPSERT,
        body: JSON.stringify({
          slug: p.slug, tipo: 'ebook', titulo: p.titulo, descricao: p.descricao, preco: p.preco, cotas, ativo: true,
          arquivo_url: p.arquivo_ref, idioma: p.idioma, forge_project_id: p.forge_project_id,
        }),
      }), 'publicar products');
    },
    async despublicarNaLoja(slug, motivo) {
      await exigirOk(await sb(env, `catalogo?slug=eq.${id(slug)}`, {
        method: 'PATCH', body: JSON.stringify({ ativo: false, motivo_inativo: motivo }),
      }), 'despublicar catalogo');
      await exigirOk(await sb(env, `products?slug=eq.${id(slug)}`, {
        method: 'PATCH', body: JSON.stringify({ ativo: false }),
      }), 'despublicar products');
    },
  };
}
