// worker/tests/helpers/banco-memoria.ts
// Banco em memória com a mesma semântica da implementação Supabase
// (src/publicacao/banco.ts): troca de estado condicional, proposta decidida
// nunca sobrescrita e registro só de acréscimo.

import type { Banco } from '../../src/publicacao/banco';
import type { Parametro, Proposta, Registro } from '../../src/publicacao/proposta';
import type { Cotacao } from '../../src/guardiao/engine';

export interface LinhaLoja { slug: string; preco: number; ativo: boolean; idioma: string; arquivo_url: string; forge_project_id: string }

export function bancoMemoria(parametros: Parametro[]) {
  const propostas = new Map<string, Proposta>();
  const registros: Registro[] = [];
  const cotacoes: Array<{ moeda: string } & Cotacao> = [];
  const loja = new Map<string, LinhaLoja>();
  const copia = <T>(v: T): T => structuredClone(v);

  const banco: Banco = {
    async proposta(id) { return copia(propostas.get(id) ?? null); },
    async listarPropostas() { return copia([...propostas.values()]); },
    async salvarProposta(p) {
      const atual = propostas.get(p.forge_project_id);
      if (atual && (atual.estado === 'publicado' || atual.estado === 'despublicado')) return false;
      propostas.set(p.forge_project_id, copia(p));
      return true;
    },
    async mudarEstado(id, de, para, precoEsperado) {
      const p = propostas.get(id);
      if (!p || p.estado !== de || (precoEsperado !== undefined && p.preco !== precoEsperado)) return null;
      p.estado = para;
      return copia(p);
    },
    async registrar(r) { registros.push(Object.freeze(copia(r))); },
    async projetosComEvento(evento) { return registros.filter((r) => r.evento === evento).map((r) => r.forge_project_id); },
    async parametros() { return copia(parametros); },
    async gravarCotacao(moeda, c) { cotacoes.push({ moeda, ...c }); },
    async publicarNaLoja(p) {
      loja.set(p.slug, { slug: p.slug, preco: p.preco!, ativo: true, idioma: p.idioma, arquivo_url: p.arquivo_ref, forge_project_id: p.forge_project_id });
    },
    async despublicarNaLoja(slug) { const l = loja.get(slug); if (l) l.ativo = false; },
  };
  return { banco, propostas, registros, cotacoes, loja };
}
