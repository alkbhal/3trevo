// ─── Motor Fiscal e Comportamental do Ático ──────────────────────────────────
// Taxonomia completa de eventos financeiros, risco fiscal (Brasil) e perfis
// comportamentais. Funções puras — sem side effects.
import { fmt } from '../utils/index.js';
import { G, AM, RD, TL, GO, MT } from '../constants.js';

// ─── Taxas e limiares reais do mercado brasileiro (atualizados mai/2025) ────────
// Fonte: BACEN SGS, Receita Federal, legislação vigente

export const TAXAS_BR = {
  // ── Crédito pessoal — médias BACEN (Nota de Crédito jan/2025) ────────────────
  cartaoRotativo:      0.1525, // 15,25%/mês — rotativo não regulado, média BACEN
  cartaoRoativoLegal:  0.0833, // 8,33%/mês — cap Lei 14.690/2023 (100%/a + encargos)
  cartaoParcelado:     0.027,  // 2,7%/mês  — parcelamento de fatura (compra parcelada)
  chequeEspecial:      0.082,  // 8,2%/mês  — cap regulatório BACEN Res. 4.765/2019
  emprestimoPessoal:   0.042,  // 4,2%/mês  — banco digital/fintech, média 2025
  consignadoPrivado:   0.019,  // 1,9%/mês  — margem INSS privado, cap PREVIC
  consignadoINSS:      0.014,  // 1,4%/mês  — cap INSS aposentados/pensionistas 2025
  financiamentoAuto:   0.023,  // 2,3%/mês  — CDC veículo, média SFN
  financiamentoImov:   0.0092, // 0,92%/mês — financiamento imobiliário SFH (juros)
  // ── Juros moratórios legais ────────────────────────────────────────────────────
  moraDiaria:          0.000333,// 0,0333%/dia = 1%/mês (Lei 4.595/1964)
  multaAtraso:         0.02,   // 2% flat sobre saldo (Lei 4.595)
  // ── Investimentos de renda fixa (mai/2025) ────────────────────────────────────
  selicAnual:          0.1475, // 14,75%/a — SELIC meta COPOM mai/2025
  cdiAnual:            0.1465, // 14,65%/a — CDI (SELIC − 10pb)
  ipcaProj2025:        0.045,  // 4,50%/a  — IPCA projeção Focus/BCB
  poupancaAnual:       0.0617, // 6,17%/a  — 70% SELIC quando SELIC > 8,5%/a (regra vigente)
  // ── IOF (Decreto 6.306/2007 — crédito pessoal PF) ────────────────────────────
  iofDiario:           0.000082,// 0,0082%/dia sobre o saldo devedor (max 365 dias)
  iofAdicional:        0.0038, // 0,38% flat sobre principal em qualquer operação de crédito
  // ── FGC e proteções ───────────────────────────────────────────────────────────
  fgcLimite:           250000, // R$ 250.000/CPF/instituição (FGC)
  fgcLimiteGlobal:     1000000,// R$ 1.000.000/CPF total FGC (quadrienal)
  // ── Descontos de renegociação (médias de mercado, variáveis) ──────────────────
  descRenegSerasa:     0.40,   // ~40% de desconto médio — Serasa Limpa Nome / Desenrola
  descRenegBanco:      0.20,   // ~20% de desconto médio — negociação direta com banco
  descRenegFinanceira: 0.35,   // ~35% — financeiras e crédito pessoal
};

// ─── Limiares fiscais 2025 (Receita Federal / IN RFB 2.175/2024) ─────────────
export const LIMIARES_FISCAIS_2025 = {
  isencaoMensal:        2259.20,  // Abaixo: isento de IRRF/carnê-leão/mês
  isencaoAnual:        27110.40,  // Limite isenção anual sem deduções
  obrigDeclarar:       33888.00,  // Renda bruta anual acima → obrigado a declarar (2024/25)
  deducaoDependente:    2275.08,  // Por dependente/ano
  deducaoSimplif:          0.20,  // 20% da renda bruta (desconto simplificado)
  limiteSimplif:        16754.34, // Teto do desconto simplificado
  // DARF vencimentos
  carneLeaoDia:            30,    // Dia de vencimento do carnê-leão
  darfAluguelCod:        '0190',  // Código DARF para aluguel recebido
  darfBicoCod:           '0190',  // Código DARF para rendimentos de PF sem retenção
  darfGcapCod:           '4600',  // Código DARF para ganho de capital
  darfGcapDia:            30,     // Último dia útil do mês seguinte à venda
  // DECRED — movimentações reportadas automaticamente ao Fisco (IN 1.571/2015)
  decredPFmensal:        2000,    // PIX/TED/DOC ≥ R$2.000/mês: banco reporta à RF
  decredPJmensal:        5000,    // Para PJ
  // Ganho de capital em ações (renda variável)
  gcapIsencaoAcoes:     20000,    // Vendas ≤ R$20.000/mês: isento IRPF em ações
  gcapIsencaoImovel:   440000,    // Venda imóvel único ≤ R$440k: isento
  gcapAliquota:          0.15,    // 15% sobre lucro > R$20k/mês em ações
  // IR regressivo renda fixa (CDB, LCI/LCA, fundos)
  irAte180d:             0.225,   // Aplicações até 180 dias
  irAte360d:             0.200,   // 181 a 360 dias
  irAte720d:             0.175,   // 361 a 720 dias
  irAcima720d:           0.150,   // Acima de 720 dias
  // LCI/LCA e poupança: isentos de IR para PF
  // Fundos de ações: 15% flat sem regressividade
};

// ─── Taxonomia de lançamentos ─────────────────────────────────────────────────
// ehRenda: se compõe base de cálculo fiscal
// ehSeu:   se o dinheiro é genuinamente do usuário
// riscoFiscal: sinal de risco para IRPF/Receita Federal
export const TIPOS_LANCAMENTO = {
  // ENTRADAS
  renda_salario:       { label: 'Salário / Pro-labore',          icone: '💰', entrada: true,  ehRenda: true,  ehSeu: true,  riscoFiscal: 'irrf'      },
  renda_eventual:      { label: 'Renda eventual / bico',         icone: '🤝', entrada: true,  ehRenda: true,  ehSeu: true,  riscoFiscal: 'carneLeao' },
  renda_aluguel:       { label: 'Aluguel recebido',              icone: '🏘', entrada: true,  ehRenda: true,  ehSeu: true,  riscoFiscal: 'carneLeao' },
  renda_investimento:  { label: 'Rendimento de investimento',    icone: '📈', entrada: true,  ehRenda: true,  ehSeu: true,  riscoFiscal: 'ir_fonte'  },
  renda_beneficio:     { label: 'Benefício social / previdência',icone: '🛡', entrada: true,  ehRenda: true,  ehSeu: true,  riscoFiscal: null        },
  juros_recebidos:     { label: 'Juros / rendimentos recebidos', icone: '💹', entrada: true,  ehRenda: true,  ehSeu: true,  riscoFiscal: 'ir_fonte'  },
  reembolso:           { label: 'Reembolso / devolução',         icone: '↩', entrada: true,  ehRenda: false, ehSeu: true,  riscoFiscal: null        },
  venda_bem:           { label: 'Venda de bem / ativo',          icone: '🏷', entrada: true,  ehRenda: false, ehSeu: true,  riscoFiscal: 'gcap'      },
  transito_entrada:    { label: 'Trânsito (dinheiro de terceiro)',icone: '⇄', entrada: true,  ehRenda: false, ehSeu: false, riscoFiscal: 'pix_alta'  },
  emprestimo_tomado:   { label: 'Empréstimo recebido',           icone: '📥', entrada: true,  ehRenda: false, ehSeu: false, riscoFiscal: null        },

  // SAÍDAS
  gasto_essencial:     { label: 'Gasto essencial',               icone: '🏠', entrada: false, ehRenda: false, ehSeu: true,  riscoFiscal: null        },
  gasto_variavel:      { label: 'Gasto variável',                icone: '🛍', entrada: false, ehRenda: false, ehSeu: true,  riscoFiscal: null        },
  parcela_divida:      { label: 'Parcela de dívida',             icone: '📋', entrada: false, ehRenda: false, ehSeu: true,  riscoFiscal: null        },
  fatura_cartao:       { label: 'Pagamento de fatura',           icone: '💳', entrada: false, ehRenda: false, ehSeu: true,  riscoFiscal: null        },
  juros_atraso:        { label: 'Multa / juros por atraso',      icone: '⚠', entrada: false, ehRenda: false, ehSeu: true,  riscoFiscal: null        },
  juros_rotativo:      { label: 'Juros de crédito rotativo',     icone: '💸', entrada: false, ehRenda: false, ehSeu: true,  riscoFiscal: null        },
  desconto_obtido:     { label: 'Desconto por antecipação',      icone: '🏷', entrada: false, ehRenda: false, ehSeu: true,  riscoFiscal: null        },
  aporte_investimento: { label: 'Aporte / investimento',         icone: '📈', entrada: false, ehRenda: false, ehSeu: true,  riscoFiscal: null        },
  imposto_pago:        { label: 'Imposto / tributo pago',        icone: '🏛', entrada: false, ehRenda: false, ehSeu: true,  riscoFiscal: null        },
  transito_saida:      { label: 'Repasse para terceiro',         icone: '⇄', entrada: false, ehRenda: false, ehSeu: false, riscoFiscal: null        },
  emprestimo_pago:     { label: 'Devolução de empréstimo',       icone: '📤', entrada: false, ehRenda: false, ehSeu: false, riscoFiscal: null        },
};

// ─── Tabela IRPF 2025 — mensal (Receita Federal) ─────────────────────────────
// Alíquotas e deduções verificadas contra a tabela oficial 2025
const TABELA_IRPF = [
  { ate: 2259.20,  aliquota: 0,     deducao: 0        }, // Isento
  { ate: 2826.65,  aliquota: 0.075, deducao: 169.44   }, // 7,5%
  { ate: 3751.05,  aliquota: 0.15,  deducao: 381.44   }, // 15%
  { ate: 4664.68,  aliquota: 0.225, deducao: 662.77   }, // 22,5%
  { ate: Infinity, aliquota: 0.275, deducao: 896.00   }, // 27,5%
];

export function calcIRPF(rendaBruta) {
  const faixa = TABELA_IRPF.find(f => rendaBruta <= f.ate);
  const imposto = rendaBruta * faixa.aliquota - faixa.deducao;
  return { aliquota: faixa.aliquota, imposto: Math.max(0, imposto), rendaBruta };
}

// ─── Juros por atraso em boleto/carnê (Lei 4.595/1964) ───────────────────────
// Multa: 2% sobre o saldo — única, no primeiro dia de atraso
// Mora: 0,0333%/dia (= 1%/mês) sobre o saldo original
// parcelaBase: valor da parcela vencida (multa/mora incidem sobre ela, não sobre o saldo total).
// Lei 4.595/64 e CDC: multa 2% + mora 1%/mês pro rata sobre a PARCELA, não sobre o total da dívida.
// taxaJurosMensalPct: taxa CONTRATUAL da própria dívida, em pontos percentuais (ex: 4 = 4%/mês) —
// mesma convenção de `divida.juros` (App.jsx). Gera um 4º componente, `juros`, incidindo sobre o
// SALDO devedor (não a parcela) durante o atraso — distinto da mora legal. Sem taxa informada → 0,
// nunca fabricado (obrigação sem taxa de mercado real, ex. pensão/judicial, não tem "juro contratual").
export function calcJurosAtraso(saldo, diasAtraso, parcelaBase, taxaJurosMensalPct) {
  if (!saldo || saldo <= 0 || diasAtraso <= 0) return { multa: 0, mora: 0, juros: 0, total: saldo || 0, acrescimo: 0 };
  const base  = parcelaBase > 0 ? parcelaBase : saldo;
  const multa = base * TAXAS_BR.multaAtraso;
  const mora  = base * TAXAS_BR.moraDiaria * diasAtraso;
  const juros = taxaJurosMensalPct > 0 ? saldo * (taxaJurosMensalPct / 100 / 30) * diasAtraso : 0;
  const acrescimo = multa + mora + juros;
  return {
    multa:    Math.round(multa * 100) / 100,
    mora:     Math.round(mora  * 100) / 100,
    juros:    Math.round(juros * 100) / 100,
    total:    Math.round((saldo + acrescimo) * 100) / 100,
    acrescimo:Math.round(acrescimo * 100) / 100,
    alerta: diasAtraso > 90 ? 'Dívida pode estar negativada no SPC/Serasa. Regularize para limpar o nome.' : null,
  };
}

// ─── Juros de crédito rotativo do cartão (Lei 14.690/2023) ───────────────────
// Após 1 ciclo sem pagar o total → entra no rotativo (~15,25%/mês, média BACEN)
// Após 2 ciclos → banco deve oferecer parcelamento obrigatório com taxa menor
export function calcJurosRotativo(faturaAberta, taxaMensal = TAXAS_BR.cartaoRotativo, ciclos = 1) {
  if (!faturaAberta || faturaAberta <= 0) return { juros: 0, totalDevido: faturaAberta || 0, historico: [], alerta: null };
  let saldo = faturaAberta;
  const historico = [];
  for (let i = 0; i < ciclos; i++) {
    const juros = saldo * taxaMensal;
    saldo = saldo + juros;
    historico.push({ mes: i + 1, juros: Math.round(juros * 100) / 100, saldo: Math.round(saldo * 100) / 100 });
  }
  const taxaAnual = Math.pow(1 + taxaMensal, 12) - 1;
  return {
    juros:        Math.round((saldo - faturaAberta) * 100) / 100,
    totalDevido:  Math.round(saldo * 100) / 100,
    taxaMensal:   (taxaMensal * 100).toFixed(2) + '%',
    taxaAnual:    (taxaAnual * 100).toFixed(1) + '%',
    historico,
    alerta: ciclos >= 2
      ? 'Lei 14.690/2023: após 2 ciclos, banco deve oferecer parcelamento a taxa regulada (~8,33%/mês). Exija essa opção.'
      : 'Pague o total da fatura. Rotativo é o crédito mais caro do Brasil.',
  };
}

// ─── Desconto por antecipação de parcela ─────────────────────────────────────
// Cálculo por valor presente das parcelas futuras (CDC art. 52 §2)
// Taxa padrão: CDI mensal (~1,14%/mês em mai/2025)
export function calcDescontoAntecipacao(saldoRestante, parcelas, taxaMensal) {
  const taxa = taxaMensal ?? (Math.pow(1 + TAXAS_BR.cdiAnual, 1 / 12) - 1);
  if (!saldoRestante || parcelas <= 0) return 0;
  const parcela = saldoRestante / parcelas;
  let vp = 0;
  for (let i = 1; i <= parcelas; i++) vp += parcela / Math.pow(1 + taxa, i);
  const desconto = saldoRestante - vp;
  return Math.max(0, Math.round(desconto * 100) / 100);
}

// ─── Detector de trânsito de terceiros ───────────────────────────────────────
// Identifica entradas que provavelmente não são renda do usuário
export function detectarTransito(lancs, mes) {
  const mesLancs = lancs.filter(l => l.data?.slice(0, 7) === mes);
  const entradas = mesLancs.filter(l => l.tipo === 'entrada');

  // Pares entrada+saída de valor próximo dentro de 7 dias → suspeito de trânsito
  const pares = [];
  entradas.forEach(e => {
    const saidas = mesLancs.filter(s =>
      s.tipo === 'saida' &&
      Math.abs(s.valor - e.valor) / Math.max(e.valor, 1) < 0.05 &&
      Math.abs(new Date(s.data) - new Date(e.data)) < 7 * 86400000
    );
    if (saidas.length > 0) pares.push({ entrada: e, saida: saidas[0], valor: e.valor });
  });

  return pares;
}

// ─── Risco fiscal mensal ──────────────────────────────────────────────────────
export function calcRiscoFiscal(lancs, mes, perfil) {
  const alertas = [];
  const mesLancs = lancs.filter(l => l.data?.slice(0, 7) === mes);
  const entradas = mesLancs.filter(l => l.tipo === 'entrada');
  const totalEntradas = entradas.reduce((s, l) => s + (l.valor || 0), 0);

  // 1. Volume ≥ limiar DECRED sem classificação → pode atrair cruzamento Receita
  // Bancos reportam movimentações ≥ R$2.000/mês por CPF à Receita (IN 1.571/2015)
  const semTipo = entradas.filter(l => !l.tipoFinanceiro);
  if (totalEntradas >= LIMIARES_FISCAIS_2025.decredPFmensal && semTipo.length >= 2) {
    alertas.push({
      nivel: 'atencao', icone: '📊',
      titulo: `Entradas R$ ${fmt(totalEntradas)} — ${semTipo.length} sem classificação`,
      msg: `Movimentações ≥ R$2.000/mês são reportadas automaticamente à Receita Federal (DECRED). Trânsito de terceiros não é renda sua.`,
      acao: 'Classifique cada entrada (renda, reembolso, trânsito). O Ático calcula só o que é genuinamente seu.',
    });
  }

  // 2. Aluguel → DARF mensal obrigatório
  const aluguel = entradas.filter(l => l.tipoFinanceiro === 'renda_aluguel');
  if (aluguel.length > 0) {
    const total = aluguel.reduce((s, l) => s + (l.valor || 0), 0);
    const { aliquota, imposto } = calcIRPF(total);
    if (aliquota > 0) {
      alertas.push({
        nivel: 'info', icone: '🏘',
        titulo: `DARF de aluguel: R$ ${fmt(imposto)} (vence dia 30)`,
        msg: `Aluguel de R$ ${fmt(total)}/mês. Alíquota IRPF: ${(aliquota * 100).toFixed(1)}%.`,
        acao: 'Emitir DARF código 0190 via e-CAC (gov.br) ou app do banco.',
      });
    }
  }

  // 3. Renda eventual / bico → carnê-leão
  const eventual = entradas.filter(l => l.tipoFinanceiro === 'renda_eventual');
  if (eventual.length > 0) {
    const total = eventual.reduce((s, l) => s + (l.valor || 0), 0);
    const { imposto } = calcIRPF(total);
    if (imposto > 0) {
      alertas.push({
        nivel: 'info', icone: '🤝',
        titulo: `Carnê-leão: renda eventual de R$ ${fmt(total)}`,
        msg: 'Rendas de pessoa física sem vínculo empregatício devem ser declaradas mensalmente no carnê-leão.',
        acao: 'Acessar carnê-leão em receita.economia.gov.br.',
      });
    }
  }

  // 4. Pares suspeitos de trânsito (entrada+saída valor próximo)
  const transito = detectarTransito(lancs, mes);
  if (transito.length > 0) {
    alertas.push({
      nivel: 'info', icone: '⇄',
      titulo: `${transito.length} possível(is) trânsito de terceiros`,
      msg: `Entradas seguidas de saídas de valor similar podem ser recursos de terceiros passando pela sua conta. Não é renda.`,
      acao: 'Marque como "Trânsito de terceiro" para excluir do cálculo fiscal.',
    });
  }

  return alertas;
}

// ─── Perfis comportamentais financeiros ───────────────────────────────────────
// Baseado em padrões de lançamentos e estado financeiro
export const PERFIS_COMPORTAMENTAIS = {
  impulsivo: {
    label: 'Gastador Impulsivo',
    descricao: 'Compras sem planejamento prévio, muitos lançamentos em "Outros", gastos no final do mês.',
    gatilho: 'Estresse, recompensa emocional, comparação social.',
    estrategia: 'Regra das 48h: não compre nada acima de R$ 50 sem esperar 2 dias.',
  },
  ansioso: {
    label: 'Ansioso Financeiro',
    descricao: 'Compra por segurança, estoque excessivo, dificuldade de investir por medo.',
    gatilho: 'Incerteza econômica, experiências de escassez.',
    estrategia: 'Reserva de emergência visível resolve a ansiedade. Foque no J3.',
  },
  negador: {
    label: 'Negador',
    descricao: 'Evita ver extrato, dívidas crescem sem atenção, surpresas frequentes.',
    gatilho: 'Vergonha financeira, paralisia diante de números ruins.',
    estrategia: 'Ver os números é o primeiro passo. O Ático não julga — só organiza.',
  },
  controlado: {
    label: 'Controlado',
    descricao: 'Registra gastos, paga em dia, mas não investe ou avança.',
    gatilho: 'Medo de risco, conforto na estabilidade.',
    estrategia: 'Você está pronto para o próximo nível: reserva investida.',
  },
  estrategista: {
    label: 'Estrategista',
    descricao: 'Planeja, investe, monitora. Sistema financeiro saudável.',
    gatilho: 'Pode subestimar custo emocional do entorno.',
    estrategia: 'Foque em multiplicar e proteger. Diversificação e legado.',
  },
};

export function detectarPerfil(lancs, dividas, irfScore) {
  const meses = {};
  lancs.forEach(l => {
    const m = l.data?.slice(0, 7);
    if (!m) return;
    if (!meses[m]) meses[m] = { outros: 0, total: 0, lancamentos: 0 };
    if (l.grupoId === 'g_outros') meses[m].outros += (l.valor || 0);
    meses[m].total += (l.valor || 0);
    meses[m].lancamentos++;
  });

  const mesesArr = Object.values(meses);
  const avgOutros = mesesArr.length ? mesesArr.reduce((s, m) => s + m.outros, 0) / mesesArr.length : 0;
  const avgLancs  = mesesArr.length ? mesesArr.reduce((s, m) => s + m.lancamentos, 0) / mesesArr.length : 0;
  const inadimplente = dividas.some(d => d.status === 'inadimplente');

  if (inadimplente || irfScore < 200) return 'negador';
  if (avgOutros > 500 || avgLancs > 30) return 'impulsivo';
  if (dividas.length > 3 && irfScore < 500) return 'ansioso';
  if (irfScore >= 700) return 'estrategista';
  return 'controlado';
}

// ─── IOF sobre operações de crédito (Decreto 6.306/2007) ─────────────────────
// Cobrado sobre empréstimo pessoal, crédito rotativo, cheque especial
// NÃO incide sobre: Tesouro Direto, CDB, LCI/LCA, poupança
export function calcIOF(valorPrincipal, diasOperacao) {
  const diasEfetivos = Math.min(diasOperacao, 365);
  const iofDiario    = valorPrincipal * TAXAS_BR.iofDiario * diasEfetivos;
  const iofAdicional = valorPrincipal * TAXAS_BR.iofAdicional;
  const total        = iofDiario + iofAdicional;
  return {
    iofDiario:   Math.round(iofDiario   * 100) / 100,
    iofAdicional:Math.round(iofAdicional* 100) / 100,
    total:       Math.round(total        * 100) / 100,
    cet:         ((total / valorPrincipal) * 100).toFixed(2) + '%',
  };
}

// ─── Simuladores de rendimento (renda fixa, mai/2025) ────────────────────────

// CDB pós-fixado: rende X% do CDI. IR regressivo por prazo.
export function calcRendimentoCDB(valor, percentualCDI = 100, meses = 12) {
  const taxaMes = Math.pow(1 + TAXAS_BR.cdiAnual, 1 / 12) - 1;
  const taxaEfetiva = taxaMes * (percentualCDI / 100);
  const bruto  = valor * (Math.pow(1 + taxaEfetiva, meses) - 1);
  const aliq   = meses <= 6 ? LIMIARES_FISCAIS_2025.irAte180d
                : meses <= 12 ? LIMIARES_FISCAIS_2025.irAte360d
                : meses <= 24 ? LIMIARES_FISCAIS_2025.irAte720d
                :               LIMIARES_FISCAIS_2025.irAcima720d;
  const ir      = bruto * aliq;
  const liquido = bruto - ir;
  return {
    bruto:   Math.round(bruto   * 100) / 100,
    ir:      Math.round(ir      * 100) / 100,
    liquido: Math.round(liquido * 100) / 100,
    aliquotaIR: (aliq * 100).toFixed(1) + '%',
    rendMensal: ((liquido / valor / meses) * 100).toFixed(2) + '%/mês líquido',
  };
}

// Tesouro Selic: mesma tributação do CDB, risco soberano, liquidez D+1
export function calcRendimentoTesoroSelic(valor, meses = 12) {
  const taxaMes = Math.pow(1 + TAXAS_BR.selicAnual, 1 / 12) - 1;
  const bruto   = valor * (Math.pow(1 + taxaMes, meses) - 1);
  const aliq    = meses <= 6  ? LIMIARES_FISCAIS_2025.irAte180d
                : meses <= 12 ? LIMIARES_FISCAIS_2025.irAte360d
                : meses <= 24 ? LIMIARES_FISCAIS_2025.irAte720d
                :               LIMIARES_FISCAIS_2025.irAcima720d;
  const ir      = bruto * aliq;
  const liquido = bruto - ir;
  return { bruto: Math.round(bruto*100)/100, ir: Math.round(ir*100)/100, liquido: Math.round(liquido*100)/100, aliquotaIR: (aliq*100).toFixed(1)+'%' };
}

// Poupança: isenta de IR — mas rende menos que CDB/Tesouro Selic
export function calcRendimentoPoupanca(valor, meses = 12) {
  const taxaMes = Math.pow(1 + TAXAS_BR.poupancaAnual, 1 / 12) - 1;
  const liquido = valor * (Math.pow(1 + taxaMes, meses) - 1);
  return { liquido: Math.round(liquido * 100) / 100, ir: 0, aliquotaIR: '0%' };
}

// Comparativo: quanto a poupança perde em relação ao CDB 100% CDI
export function calcPerdasPoupanca(valor, meses = 12) {
  const cdb  = calcRendimentoCDB(valor, 100, meses);
  const poup = calcRendimentoPoupanca(valor, meses);
  const diferenca = cdb.liquido - poup.liquido;
  return { cdb: cdb.liquido, poupanca: poup.liquido, diferenca: Math.round(diferenca * 100) / 100,
    msg: diferenca > 0 ? `CDB 100% CDI rende R$ ${fmt(diferenca)} a mais que poupança em ${meses} meses` : null };
}

