/**
 * publicacao/proposta.ts — Três Trevo Worker
 * Do pacote do forge à proposta de publicação (spec publicação por idioma v2).
 * Função pura: sem rede, sem banco, sem relógio. Quem chama entrega os parâmetros
 * de custo do dono, as cotações PTAX e a data de hoje.
 *
 * Nunca publica (D3): o melhor resultado possível é `pronto_para_aprovacao`.
 */

import { precificar, POLITICAS_PRECO, VERSAO, type Cotacao, type Custos, type ResultadoPrecificacao } from '../guardiao/engine';
import { refInterna } from '../forge-arquivo';
import { IDIOMAS_LOJA, type Pacote } from './pacote';

export type Estado = 'rascunho' | 'pronto_para_aprovacao' | 'publicado' | 'recusado' | 'despublicado';

export interface Proposta {
  forge_project_id: string;
  parent_project_id: string | null;
  idioma: string;
  slug: string;
  titulo: string;
  descricao: string;
  arquivo_ref: string;
  estado: Estado;
  motivos: string[];
  /** Sempre BRL; null quando o motor não deu preço. */
  preco: number | null;
  /** Diagnóstico completo do motor (evidência que o dono vê antes de aprovar). */
  precificacao: ResultadoPrecificacao | null;
}

/** Uma linha de precificacao_parametros: valor do dono, medido ou estimado, com fonte. */
export interface Parametro { chave: string; valor: number | null; estado: string; fonte: string | null }

export interface Registro {
  forge_project_id: string;
  evento: 'proposta' | 'rascunho' | 'reenvio_ignorado' | 'aprovacao' | 'publicacao' | 'recusa' | 'despublicacao' | 'aviso_reavaliacao';
  estado: Estado | null;
  preco: number | null;
  comparaveis: unknown;
  cotacoes: unknown;
  componentes_liquido: unknown;
  estimados: unknown;
  versao_politica: string;
  versao_guardiao: string;
  decidido_por: string;
  motivo: string | null;
}

export const MOEDA_VENDA = 'BRL';

// Chave da tabela → campo do motor. Nada de padrão no código: o que o dono não
// informou chega como null e o motor diz o que falta.
const CAMPOS_CUSTO: Record<string, keyof Custos> = {
  variavel_por_exemplar: 'variavelPorExemplar',
  fixo_mensal: 'fixoMensal',
  producao_da_obra: 'producaoDaObra',
  taxa_pagamento_pct: 'taxaPagamentoPct',
  taxa_pagamento_fixa: 'taxaPagamentoFixa',
  imposto_pct: 'impostoPct',
  estorno_pct: 'estornoPct',
  desconto_loja_pct: 'descontoLojaPct',
};

export function custosDe(parametros: Parametro[]): Custos {
  const custos: Custos = { origens: {} };
  for (const p of parametros) {
    const campo = CAMPOS_CUSTO[p.chave];
    if (!campo) continue;
    (custos as Record<string, unknown>)[campo] = p.valor;
    custos.origens![campo] = { estado: p.estado, fonte: p.fonte };
  }
  return custos;
}

/** Moedas estrangeiras dos comparáveis: cada uma precisa de PTAX (R4.6). */
export function moedasEstrangeiras(pkg: Pacote): string[] {
  return [...new Set(pkg.mercado.comparaveis.map((c) => c.moeda).filter((m) => m && m !== MOEDA_VENDA))];
}

export function slugDe(titulo: string, projectId: string): string {
  const base = titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return `${base || 'obra'}-${projectId.slice(0, 8)}`;
}

/**
 * Monta a proposta. `rascunho` sempre com motivo escrito (R5); `pronto_para_aprovacao`
 * só com todas as condições de R4. A assinatura (R4.1) é conferida antes, no webhook.
 */
export function montarProposta(
  pkg: Pacote,
  parametros: Parametro[],
  cotacoes: Record<string, Cotacao>,
  hoje: string,
): Proposta {
  const temEpub = pkg.arquivos.some((a) => a.startsWith(`epub/${pkg.projectId}/`));
  const base = {
    forge_project_id: pkg.projectId,
    parent_project_id: pkg.parentProjectId,
    idioma: pkg.idioma,
    slug: slugDe(pkg.titulo, pkg.projectId),
    titulo: pkg.titulo,
    descricao: pkg.descricao,
    arquivo_ref: refInterna(pkg.projectId, temEpub ? 'epub' : 'html'),
  };
  const rascunho = (motivos: string[], precificacao: ResultadoPrecificacao | null = null): Proposta =>
    ({ ...base, estado: 'rascunho', motivos, preco: null, precificacao });

  if (!(IDIOMAS_LOJA as readonly string[]).includes(pkg.idioma)) {
    return rascunho([`idioma ${pkg.idioma} sem biblioteca na loja (só ${IDIOMAS_LOJA.join(', ')})`]);
  }
  if (pkg.mercado.estado !== 'coletado') {
    return rascunho([`mercado não coletado pelo forge${pkg.mercado.motivo ? `: ${pkg.mercado.motivo}` : ''}`]);
  }

  const historico = parametros.find((p) => p.chave === 'autor_com_historico')?.valor === 1;
  const r = precificar({
    moeda: MOEDA_VENDA,
    hoje,
    obra: {
      // O forge grava o gênero da obra em cada comparável (genero_por: 'consulta').
      genero: pkg.mercado.comparaveis[0]?.genero ?? 'desconhecido',
      idioma: pkg.idioma,
      paginas: pkg.tamanho.paginas_estimadas,
      qualidade: pkg.qualidade.nota ?? null,
    },
    cotacoes,
    custos: custosDe(parametros),
    politica: POLITICAS_PRECO.ebook,
    comparaveis: pkg.mercado.comparaveis.map((c) => ({ ...c, titulo: c.titulo ?? undefined })),
    historicoAutor: historico ? 'com_historico' : 'sem_historico',
  });
  if ('erros' in r) return rascunho(r.erros.map((e) => `entrada do motor inválida: ${e}`));

  // R4.6 com motivo próprio: sem PTAX o motor só diz "mercado insuficiente", que esconde a causa.
  const motivos = [
    ...moedasEstrangeiras(pkg).filter((m) => !cotacoes[m]).map((m) => `cotação PTAX indisponível para ${m}`),
    ...r.motivos,
  ];
  if (!r.pronto_para_aprovacao || r.sugestao === null || motivos.length) return rascunho(motivos, r);
  return { ...base, estado: 'pronto_para_aprovacao', motivos: [], preco: r.sugestao, precificacao: r };
}

/** Registro imutável de uma decisão (R7), com a evidência que valia naquele momento. */
export function registroDe(
  p: Proposta,
  evento: Registro['evento'],
  decidido_por: string,
  motivo: string | null = null,
): Registro {
  const r = p.precificacao;
  const cotacoes: Record<string, unknown> = {};
  for (const u of r?.mercado.usados ?? []) if (u.conversao) cotacoes[u.conversao.de] = u.conversao;
  return {
    forge_project_id: p.forge_project_id,
    evento,
    estado: p.estado,
    preco: p.preco,
    comparaveis: (r?.mercado.usados ?? []).map((u) => ({ url: u.url, titulo: u.titulo, referencia: u.referencia, preco_brl: u.preco, coletadoEm: u.coletadoEm })),
    cotacoes,
    componentes_liquido: r?.venda ? { ...r.venda.componentes, liquido: r.venda.liquido, nema: r.venda.nema, operacao: r.venda.operacao } : null,
    estimados: r?.estimados ?? [],
    versao_politica: POLITICAS_PRECO.ebook.decidido_em ?? 'desconhecida',
    versao_guardiao: VERSAO,
    decidido_por,
    motivo: motivo ?? (p.motivos.length ? p.motivos.join('; ') : null),
  };
}
