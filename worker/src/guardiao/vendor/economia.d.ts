// Tipos do contrato econômico (src/economia.js). Ver CHANGELOG 0.2.0.

export interface ItemPreco {
  provedor: string;
  modelo: string;
  aliases?: string[];
  entrada_por_mtok?: number;
  saida_por_mtok?: number;
  cache_leitura_por_mtok?: number;
  /** Acima deste número de tokens de entrada a tarifa muda; o custo vira null. */
  limite_entrada_tokens?: number;
  estado: 'verificado' | 'nao_verificado';
  verificado_em?: string;
  fonte?: string;
  vigente_desde?: string;
  vigente_ate?: string;
  observacao?: string;
}

export interface CatalogoPrecos {
  versao: string;
  moeda: 'USD';
  itens: ItemPreco[];
}

export interface Uso {
  tokens_entrada?: number | null;
  tokens_saida?: number | null;
  tokens_cache_leitura?: number | null;
}

export interface EntradaExecucao extends Uso {
  projeto: string;
  tarefa: string;
  provedor: string;
  modelo: string;
  dia?: string;
  custo_reportado?: number | null;
  custo_legado?: number | null;
  testes?: 'passou' | 'falhou' | 'nao_rodou' | null;
  estado_pr?: 'aberto' | 'mesclado' | 'fechado' | 'revertido' | null;
  sinais_qualidade?: string[];
}

export interface RegistroExecucao {
  readonly projeto: string;
  readonly tarefa: string;
  readonly provedor: string;
  readonly modelo: string;
  readonly tokens_entrada: number | null;
  readonly tokens_saida: number | null;
  readonly custo_estimado: number | null;
  readonly custo_reportado: number | null;
  readonly custo_legado: number | null;
  readonly versao_catalogo: string;
  readonly preco_verificado_em: string | null;
  /** true: a chamada é anterior à conferência do preço (preço suposto inalterado). null: sem preço verificado. */
  readonly preco_retroativo: boolean | null;
  readonly testes: 'passou' | 'falhou' | 'nao_rodou';
  readonly estado_pr: 'aberto' | 'mesclado' | 'fechado' | 'revertido' | null;
  readonly sinais_qualidade: readonly string[];
}

export interface ExecutorSql {
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: unknown[]): Promise<{ changes: number }>;
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | null>;
}

export type Reserva = { ok: true; id: string; repetida?: true } | { ok: false; motivo: 'valor_invalido' | 'teto_atingido' | 'sem_teto' | 'chave_em_uso' };

/** Valores em USD; internamente o portão guarda micro-dólares inteiros. */
export interface Saldo { teto: number; comprometido: number; disponivel: number; sem_telemetria: number; em_aberto: number }

export interface Portao {
  preparar(): Promise<void>;
  definirTeto(escopo: string, tetoUsd: number): Promise<void>;
  /** `chave` torna a reserva idempotente (retry ou evento duplicado devolvem a mesma reserva). */
  reservar(escopo: string, valorUsd: number | null | undefined, opcoes?: { chave?: string }): Promise<Reserva>;
  confirmar(reservaId: string, gastoUsd: number | null): Promise<void>;
  liberar(reservaId: string): Promise<void>;
  /** Só para execução confirmada sem telemetria: troca o valor conservador pelo faturado. */
  reconciliar(reservaId: string, gastoUsd: number): Promise<void>;
  /** Encerra reservas criadas antes de `antesDe` como gasto integral sem telemetria. Nunca devolve dinheiro. */
  encerrarAbandonadas(escopo: string, antesDe: string): Promise<number>;
  saldo(escopo: string): Promise<Saldo | null>;
}

export function validarCatalogo(cat: unknown): string[];
export function precoDe(cat: CatalogoPrecos, provedor: string, modelo: string, dia?: string): ItemPreco | null;
export function custoEstimado(item: ItemPreco | null, uso: Uso | null): number | null;
export function registrarExecucao(cat: CatalogoPrecos, e: EntradaExecucao): { registro: RegistroExecucao; erros?: undefined } | { erros: string[]; registro?: undefined };
export function deUsoForge(cat: CatalogoPrecos, uso: { model: string; input_tokens: number; output_tokens: number; cost_usd: number }, ctx: { projeto: string; tarefa: string } & Partial<EntradaExecucao>): ReturnType<typeof registrarExecucao>;
export function criarPortao(db: ExecutorSql, opcoes?: { agora?: () => string; novoId?: () => string }): Portao;
export function executorD1(d1: unknown): ExecutorSql;
export const ESQUEMA: string;
