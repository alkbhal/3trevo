// Tipos do núcleo do Guardião (guardiao-core.js). Versão do núcleo em VERSAO.

export type Nivel = 'violacao' | 'divergente' | 'nao_confirmado' | 'confirmado';

export interface Parcial {
  nivel: Nivel;
  titulo: string;
  explicacao: string;
  resultadoObservado: string;
  acaoRecomendada?: string | null;
  entrada?: string;
  confianca?: string;
  testeConfirmacao?: string;
}

export interface Invariante<C = any> {
  id: string;
  categoria: string;
  regra: string;
  resultadoEsperado: string;
  impacto: string[];
  entrada?: string;
  confianca?: string;
  testeConfirmacao?: string;
  /** Chaves do contexto que precisam ser "truthy" para o check rodar (senão 🟡). */
  requer?: (keyof C)[];
  /** Capacidades (opts.capacidades) que o ambiente precisa ter (senão 🟡). */
  exige?: string[];
  executar: (ctx: C) => Promise<Parcial> | Parcial;
}

export interface Resultado extends Omit<Parcial, 'entrada' | 'confianca' | 'testeConfirmacao'> {
  id: string;
  categoria: string;
  quando: string;
  regra: string;
  entrada: string | null;
  resultadoEsperado: string;
  impacto: string[];
  confianca: string | null;
  testeConfirmacao: string | null;
}

export interface Guarda {
  nome: string;
  iniciar?(): void;
  antes?(def: Invariante, ctx: any): unknown;
  /** Devolve um parcial (normalmente 🔴) para SUBSTITUIR o resultado do check, ou null. */
  depois?(def: Invariante, estado: any, parcial: Parcial): Parcial | null;
  meta?(): { def: Omit<Invariante, 'executar'>; parcial: Parcial } | null;
  encerrar?(): void;
}

export interface OpcoesVerificar {
  capacidades?: string[];
  guardas?: Guarda[];
}

export type Padrao =
  | { tipo: 'oscilante'; mudancas: number; de: Nivel }
  | { tipo: 'primeira_ocorrencia' | 'regrediu' | 'resolvido' | 'melhorou'; de: Nivel }
  | { tipo: 'persistente'; execucoes: number }
  | { tipo: 'recorrente'; vezes: number }
  | { tipo: 'estavel' };

export interface ExecucaoHistorica { resultados: { id: string; nivel: Nivel }[] }

export const VERSAO: string;
export const NIVEL_ORDEM: Record<Nivel, number>;
export const NIVEL_ICONE: Record<Nivel, string>;
export const NIVEL_LABEL: Record<Nivel, string>;

/** Checks que podem ser assíncronos (fetch, KV, banco). */
export function verificar<C extends object>(ctx: C, catalogo: Invariante<C>[], contratados: string[], opts?: OpcoesVerificar): Promise<Resultado[]>;
/** Checks síncronos (navegador, CLI). Check que devolve Promise vira 🟠. */
export function verificarSync<C extends object>(ctx: C, catalogo: Invariante<C>[], contratados: string[], opts?: OpcoesVerificar): Resultado[];

export function statusGeral(resultados: Pick<Resultado, 'nivel'>[]): { status: 'bloqueio' | 'nao_concluido' | 'atencao' | 'ok'; icone: string; titulo: string; texto: string };
export function resumo(resultados: Resultado[], contratados: string[]): { contratados: number; reportados: number; porNivel: Record<Nivel, number> };
export function classificarPadrao(id: string, nivelAtual: Nivel, historico: ExecucaoHistorica[]): Padrao | null;
export function calcularRisco(id: string, nivelAtual: Nivel, historico: ExecucaoHistorica[]): { execucoes: number; mudancas: number; problematicas: number; instabilidade: number } | null;

export function guardaStorage(cfg?: { raiz?: any; canais?: string[] }): Guarda;
