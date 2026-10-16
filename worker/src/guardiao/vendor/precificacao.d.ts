export interface Custos {
  /** Custo de produzir e entregar um exemplar (IA, serviços, armazenamento), na moeda da venda. */
  variavelPorExemplar?: number | null;
  /** Custos fixos do mês (assinaturas, domínio, ferramentas). Não entra no preço: vira meta de vendas. */
  fixoMensal?: number | null;
  /** Custo de produzir a obra uma vez (IA, imagens, pesquisa) — diluído pelas vendas. */
  producaoDaObra?: number | null;
  /** De onde veio cada insumo: 'medido' (extrato, vendas) ou estimado com fonte. */
  origens?: Record<string, { estado: 'medido' | 'estimado' | string; fonte?: string | null }>;
  /** Taxa percentual do meio de pagamento (ex.: 4.99 para 4,99%). */
  taxaPagamentoPct?: number | null;
  /** Taxa fixa por venda, se houver. */
  taxaPagamentoFixa?: number | null;
  /** Imposto sobre a venda, em % do cobrado. Depende do regime tributário: sem ele, o líquido é indefinido. */
  impostoPct?: number | null;
  /** Estornos/reembolsos esperados, em % do cobrado (0 tem de ser declarado). */
  estornoPct?: number | null;
  /** Desconto bancado pela loja na oferta (cupom), em % do preço cheio. Ausente = 0. */
  descontoLojaPct?: number | null;
}

export interface Politica {
  /** E-book: custo por exemplar de no máximo X% do preço. */
  limiteCustoPct?: number | null;
  /** SaaS: margem mínima sobre o preço. */
  margemMinimaPct?: number | null;
  /** Parte do líquido de cada venda que vai para o Nema (0.5 = metade). */
  fracaoNemaDoLiquido?: number | null;
  decidido_em?: string;
}

/** Componentes do líquido distribuível, na moeda da venda. Todos obrigatórios (zero declarado). */
export interface ComponentesVenda {
  valorPago: number; descontosLoja: number; taxasPagamento: number; impostos: number; estornos: number;
}
export interface Liquido {
  valor: number | null; nema: number | null; operacao: number | null;
  componentes: { [K in keyof ComponentesVenda]: number | null };
  faltando: string[];
}
export interface Venda {
  preco: number | null;
  componentes: { [K in keyof ComponentesVenda]: number | null };
  /** null quando falta qualquer componente — nunca se reparte líquido indefinido. */
  liquido: number | null; nema: number | null; operacao: number | null;
  /** Custo de produção: fora do líquido, sai da operação. */
  custo_producao_por_exemplar: number | null;
  sobra_operacao: number | null;
  faltando: string[];
}
export interface Meta { vendas_para_pagar_o_fixo: number; fixo_mensal: number; sobra_por_venda: number }
/** Cotação PTAX (BCB): 1 unidade da moeda em BRL, com data do boletim e fonte. */
export interface Cotacao { taxa: number; data: string; fonte: string }

export interface Comparavel {
  titulo?: string;
  preco: number;
  moeda: string;
  paginas: number;
  genero: string;
  idioma: string;
  /** Página pública onde o preço foi visto (https). */
  url: string;
  /** AAAA-MM-DD */
  coletadoEm: string;
}

export interface Medida { estado: string; [k: string]: unknown }

export interface EntradaPrecificacao {
  moeda: string;
  /** AAAA-MM-DD — a função não lê o relógio. */
  hoje: string;
  /** qualidade: nota 0–100 da obra (portão do forge); posiciona dentro da faixa de mercado. */
  obra: { genero: string; idioma: string; paginas: number; qualidade?: number | null };
  /** Cotações PTAX por moeda dos comparáveis estrangeiros (ex.: { USD: {...}, EUR: {...} }). */
  cotacoes?: Record<string, Cotacao>;
  custos?: Custos;
  politica?: Politica;
  /** Atalho antigo: equivale a politica = { margemMinimaPct }. */
  margemMinimaPct?: number | null;
  comparaveis?: Comparavel[];
  historicoAutor: 'sem_historico' | 'com_historico';
  disposicaoAPagar?: Medida;
  valorPercebido?: Medida;
  opcoes?: Partial<Padroes>;
}

export interface Padroes {
  minimoComparaveis: number; faixaTamanho: [number, number]; validadeDias: number;
  validadeCotacaoDias: number; faixaQualidade: [number, number];
}

export interface Piso {
  valor: number | null;
  faltando: string[];
  partes: { custo_variavel: number; base: 'preco_bruto'; limite_custo_pct: number | null; margem_pct: number | null;
            taxa_pct: number | null; imposto_pct: number | null; taxa_fixa: number | null } | null;
}

export interface Posicao {
  faixa: string; de: number; ate: number;
  qualidade: number | null; fator_qualidade: number | null; alvo: number;
  /** Só referência estatística — não é obrigação de preço. */
  p25_referencia: number;
  nota: string | null;
  ajustado_ao_piso: boolean;
}

export interface ComparavelUsado {
  titulo: string | null; url: string; coletadoEm: string; paginas: number;
  referencia: { preco: number; moeda: string };
  conversao: { taxa: number; data: string; fonte: string; de: string; para: string } | null;
  /** Na moeda da venda. */
  preco: number;
}

export interface ResultadoPrecificacao {
  moeda: string;
  sugestao: number | null;
  posicao: Posicao | null;
  venda: Venda | null;
  meta: Meta | null;
  vendas_para_diluir_producao: number | null;
  estimados: Array<{ campo: string; estado: string; fonte: string | null }>;
  /** D3: a proposta pode ir ao dono. Nunca publica sozinha. */
  pronto_para_aprovacao: boolean;
  exige_aprovacao_do_dono: true;
  motivos: string[];
  piso: Piso;
  mercado: {
    n: number; minimo_exigido: number;
    p25: number | null; mediana: number | null; p75: number | null;
    usados: ComparavelUsado[];
    descartados: Array<{ url: string | null; motivo: string }>;
  };
  disposicao_a_pagar: Medida;
  valor_percebido: Medida;
}

export function precificar(e: EntradaPrecificacao): ResultadoPrecificacao | { erros: string[] };
export function calcularPiso(custos: Custos | undefined, politica: Politica | undefined): Piso;
export function liquidoDistribuivel(componentes: Partial<ComponentesVenda> | null | undefined, politica: Politica): Liquido;
export function distribuirVenda(preco: number, custos: Custos, politica: Politica): Venda;
export function metaMensal(fixoMensal: number | null | undefined, sobraPorVenda: number | null | undefined): Meta | null;
export function fatorQualidade(nota: number | null | undefined, faixa: [number, number]): number | null;
export function vendasParaDiluir(custoProducao: number | null | undefined, preco: number, limitePct: number): number | null;
export const POLITICAS: Readonly<{ ebook: Readonly<Politica>; saas: Readonly<Politica> }>;
export function percentil(ordenados: number[], p: number): number | null;
export const PADROES: Readonly<Padroes>;
