/**
 * GUARDIÃO — PRECIFICAÇÃO FUNDAMENTADA, comum aos projetos TT que vendem obra.
 *
 * Uma sugestão de preço só existe quando cada número tem origem:
 *   - PISO: e-book → custo de produção por exemplar ≤ 5% do PREÇO BRUTO (preço cheio da oferta);
 *     SaaS → margem mínima depois de taxa e imposto. Falta um insumo → piso `null`, com a lista do
 *     que falta. Nunca um custo suposto.
 *   - MERCADO: preços reais de obras comparáveis (mesmo gênero, idioma e tamanho), cada um com link
 *     e data de coleta, na moeda do mercado de origem (USD nos EUA, EUR na Espanha). Para vender em
 *     BRL, o preço é convertido pela PTAX do Banco Central — taxa, data e fonte ficam gravadas junto
 *     do preço original. Comparável sem cotação válida é descartado, nunca convertido por chute.
 *   - POSIÇÃO (decisão de 2026-10-14): o p25 é só referência estatística, não obrigação. Autor sem
 *     histórico fica ENTRE o p25 e a mediana, e a nota de qualidade da obra decide onde; com
 *     histórico, entre a mediana e o p75. Se o piso ficar acima do alvo mas dentro do mercado
 *     (≤ p75), o preço sobe ao piso. Se o mercado não cobre o piso, não há preço: rascunho.
 *   - LÍQUIDO DISTRIBUÍVEL (decisão de 2026-10-14) = valor pago − descontos bancados pela loja
 *     − taxas do meio de pagamento − impostos − estornos/reembolsos. Nema = 50% disso. Componente
 *     indefinido (ex.: imposto antes de saber o regime tributário) → líquido `null` com o que falta.
 *     O custo de produção NÃO entra no líquido: sai da parte da operação, registrado à parte.
 *   - DISPOSIÇÃO A PAGAR e VALOR PERCEBIDO: só existem medidos (vendas por preço, avaliações). Sem
 *     medida, aparecem como `nao_medido` — nunca estimados por modelo.
 *
 * PUBLICAÇÃO SUPERVISIONADA (D3, 2026-10-14): mesmo com tudo fundamentado, o dono aprova antes de
 * publicar. `pronto_para_aprovacao` diz se a proposta pode ir ao dono; nunca publica sozinho.
 *
 * O custo fixo do mês não entra no preço: vira META DE VENDAS; o que passa da meta é fundo de
 * investimento (ex.: Jarvis). Sem histórico, os insumos começam pela média de mercado, marcados como
 * estimados e com fonte, e são trocados pelo medido com o uso.
 *
 * Função pura: sem rede, sem banco, sem relógio (a data de hoje e a cotação entram como argumento).
 * NÃO edite a cópia vendida num projeto: melhoria vai para o repositório `guardiao`.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.GuardiaoPrecificacao = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const DATA = /^\d{4}-\d{2}-\d{2}$/;
  const centavos = v => Math.round(v * 100) / 100;

  // Decisões do dono: 2026-10-13 (limites e fração do Nema) e 2026-10-14 (5% sobre o preço bruto,
  // líquido distribuível explícito). Mudar aqui é mudar a política: registre a nova decisão.
  const POLITICAS = Object.freeze({
    ebook: Object.freeze({ limiteCustoPct: 5, fracaoNemaDoLiquido: 0.5, decidido_em: '2026-10-14' }),
    saas: Object.freeze({ margemMinimaPct: 50, fracaoNemaDoLiquido: 0.5, decidido_em: '2026-10-14' }),
  });

  const PADROES = Object.freeze({
    minimoComparaveis: 5,
    // Comparável fora de [metade, dobro] do tamanho da obra mede outra coisa.
    faixaTamanho: [0.5, 2],
    // Preço coletado há mais tempo que isso já não descreve o mercado.
    validadeDias: 90,
    // PTAX não sai em fim de semana e feriado: até 7 dias corridos cobre o último boletim.
    validadeCotacaoDias: 7,
    // Nota de qualidade (0–100) → fator 0 no início da faixa, 1 no fim, linear no meio.
    faixaQualidade: [60, 90],
  });

  function diasEntre(a, b) {
    return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
  }

  /** Percentil com interpolação linear sobre valores já ordenados. */
  function percentil(ordenados, p) {
    if (ordenados.length === 0) return null;
    const pos = (ordenados.length - 1) * p;
    const base = Math.floor(pos), resto = pos - base;
    const prox = ordenados[base + 1];
    return prox === undefined ? ordenados[base] : ordenados[base] + resto * (prox - ordenados[base]);
  }

  /**
   * Piso por exemplar, sobre o PREÇO BRUTO (preço cheio da oferta). O fixo não entra (vira meta).
   *  - limiteCustoPct (e-book): custo de produção ≤ X% do preço bruto → P ≥ custo / X%.
   *    Taxas e impostos não entram aqui: são registrados à parte, no líquido.
   *  - margemMinimaPct (SaaS): P·(1 − taxa% − imposto% − margem%) ≥ custo + taxaFixa.
   * Com as duas regras, vale a mais exigente. Insumo faltando → null + o que falta.
   */
  function calcularPiso(custos, politica) {
    const c = custos || {}, pol = politica || {};
    const custo = num(c.variavelPorExemplar), taxa = num(c.taxaPagamentoPct), imposto = num(c.impostoPct);
    const limite = num(pol.limiteCustoPct), margem = num(pol.margemMinimaPct);
    const taxaFixa = num(c.taxaPagamentoFixa) || 0;
    const faltando = [];
    if (custo === null) faltando.push('custo_variavel_por_exemplar');
    if (limite === null && margem === null) faltando.push('politica (limiteCustoPct ou margemMinimaPct)');
    if (margem !== null && taxa === null) faltando.push('taxa_pagamento_pct');
    if (margem !== null && imposto === null) faltando.push('imposto_pct (depende do regime tributário)');
    if (faltando.length) return { valor: null, faltando, partes: null };
    const candidatos = [];
    if (limite !== null) {
      if (limite <= 0) return { valor: null, faltando: ['limiteCustoPct > 0'], partes: null };
      candidatos.push(custo / (limite / 100));
    }
    if (margem !== null) {
      const livre = 1 - taxa / 100 - imposto / 100 - margem / 100;
      if (livre <= 0) return { valor: null, faltando: ['taxa + imposto + margem < 100%'], partes: null };
      candidatos.push((custo + taxaFixa) / livre);
    }
    return {
      valor: centavos(Math.max(...candidatos)),
      faltando: [],
      partes: { custo_variavel: centavos(custo), base: 'preco_bruto', limite_custo_pct: limite, margem_pct: margem,
                taxa_pct: margem !== null ? taxa : null, imposto_pct: margem !== null ? imposto : null,
                taxa_fixa: margem !== null ? centavos(taxaFixa) : null },
    };
  }

  const COMPONENTES = ['valorPago', 'descontosLoja', 'taxasPagamento', 'impostos', 'estornos'];

  /**
   * Líquido distribuível de uma venda REAL (valores absolutos, na moeda da venda):
   *   valorPago (preço cheio da oferta) − descontosLoja (cupom bancado pela loja) − taxasPagamento
   *   − impostos − estornos (reembolsos atribuíveis à venda).
   * Todos obrigatórios; zero tem de ser declarado. Nema = fração da política × líquido.
   * Faltou um → valor `null` com a lista: nunca se reparte um líquido indefinido.
   */
  function liquidoDistribuivel(componentes, politica) {
    const c = componentes || {}, fracao = num((politica || {}).fracaoNemaDoLiquido);
    const faltando = COMPONENTES.filter(k => num(c[k]) === null || c[k] < 0);
    if (fracao === null) faltando.push('politica.fracaoNemaDoLiquido');
    const registro = Object.fromEntries(COMPONENTES.map(k => [k, num(c[k]) === null ? null : centavos(c[k])]));
    if (faltando.length) return { valor: null, nema: null, operacao: null, componentes: registro, faltando };
    const liq = centavos(c.valorPago - c.descontosLoja - c.taxasPagamento - c.impostos - c.estornos);
    const nema = liq > 0 ? centavos(liq * fracao) : 0;
    // Operação = líquido − Nema já em centavos: as partes sempre somam o líquido (contabilidade fecha).
    return { valor: liq, nema, operacao: centavos(liq - nema), componentes: registro, faltando: [] };
  }

  /**
   * Projeção de uma venda ao preço `preco`: monta os componentes a partir dos percentuais
   * (taxaPagamentoPct, impostoPct, estornoPct, descontoLojaPct) e reparte o líquido. O custo de
   * produção sai da parte da operação e fica registrado à parte (`sobra_operacao`).
   * descontoLojaPct ausente = oferta sem cupom (0). Imposto e estorno não têm padrão: são exigidos.
   */
  function distribuirVenda(preco, custos, politica) {
    const p = num(preco), c = custos || {};
    const taxaPct = num(c.taxaPagamentoPct), impostoPct = num(c.impostoPct), estornoPct = num(c.estornoPct);
    const descontoPct = num(c.descontoLojaPct) || 0, custo = num(c.variavelPorExemplar);
    const faltando = [];
    if (p === null) faltando.push('preco');
    if (taxaPct === null) faltando.push('taxa_pagamento_pct');
    if (impostoPct === null) faltando.push('imposto_pct (depende do regime tributário)');
    if (estornoPct === null) faltando.push('estorno_pct');
    let comp = null;
    if (p !== null) {
      const desconto = p * descontoPct / 100, cobrado = p - desconto;
      comp = {
        valorPago: p, descontosLoja: desconto,
        taxasPagamento: taxaPct === null ? null : cobrado * taxaPct / 100 + (num(c.taxaPagamentoFixa) || 0),
        impostos: impostoPct === null ? null : cobrado * impostoPct / 100,
        estornos: estornoPct === null ? null : cobrado * estornoPct / 100,
      };
    }
    const l = liquidoDistribuivel(comp, politica);
    // Os componentes faltantes já estão em `faltando` com o nome do insumo; da política, só a fração.
    const todos = l.faltando.includes('politica.fracaoNemaDoLiquido') ? [...faltando, 'politica.fracaoNemaDoLiquido'] : faltando;
    const indefinido = todos.length > 0;
    return {
      preco: p === null ? null : centavos(p),
      componentes: l.componentes,
      liquido: indefinido ? null : l.valor,
      nema: indefinido ? null : l.nema,
      operacao: indefinido ? null : l.operacao,
      custo_producao_por_exemplar: custo === null ? null : centavos(custo),
      sobra_operacao: indefinido || custo === null ? null : centavos(l.operacao - custo),
      faltando: custo === null ? [...todos, 'custo_variavel_por_exemplar'] : todos,
    };
  }

  /**
   * Meta do mês: quantas vendas a sobra da operação precisa para pagar o custo fixo.
   * Cada venda além da meta vira fundo de investimento. Venda que não deixa sobra → null.
   */
  function metaMensal(fixoMensal, sobraPorVenda) {
    const f = num(fixoMensal), o = num(sobraPorVenda);
    if (f === null || o === null || o <= 0) return null;
    return { vendas_para_pagar_o_fixo: Math.ceil(f / o - 1e-9), fixo_mensal: centavos(f), sobra_por_venda: centavos(o) };
  }

  /** Quantas vendas até o custo de produção da obra ficar dentro do limite % do preço. */
  function vendasParaDiluir(custoProducao, preco, limitePct) {
    const c = num(custoProducao), p = num(preco), l = num(limitePct);
    if (c === null || p === null || l === null || p <= 0 || l <= 0) return null;
    return Math.ceil(c / (p * l / 100) - 1e-9);
  }

  /**
   * Cotação PTAX válida para converter `moeda` em hoje? Devolve o motivo da recusa, ou null.
   * Esperado: { taxa: >0 (1 unidade da moeda em BRL), data: AAAA-MM-DD, fonte: texto }.
   */
  function motivoCotacaoInvalida(cot, moeda, hoje, validade) {
    if (!cot) return `moeda ${moeda} sem cotação PTAX`;
    if (num(cot.taxa) === null || cot.taxa <= 0) return `cotação ${moeda} sem taxa válida`;
    if (typeof cot.data !== 'string' || !DATA.test(cot.data)) return `cotação ${moeda} sem data`;
    if (typeof cot.fonte !== 'string' || !cot.fonte.trim()) return `cotação ${moeda} sem fonte`;
    const d = diasEntre(cot.data, hoje);
    if (d < 0) return `cotação ${moeda} com data no futuro`;
    if (d > validade) return `cotação ${moeda} de ${cot.data} vencida (mais de ${validade} dias)`;
    return null;
  }

  /**
   * Separa comparáveis válidos dos descartados, sempre dizendo por quê. Comparável em outra moeda
   * só entra convertido pela cotação de `cotacoes[moeda]` (PTAX): o usado guarda o preço original,
   * a moeda original e a cotação (taxa, data, fonte) ao lado do preço convertido.
   */
  function filtrarComparaveis(obra, comparaveis, moeda, hoje, opcoes, cotacoes) {
    const usados = [], descartados = [], vistos = new Set();
    const [min, max] = opcoes.faixaTamanho;
    for (const c of comparaveis || []) {
      const url = c && typeof c.url === 'string' ? c.url : '';
      const estrangeira = c && c.moeda !== moeda;
      const cot = estrangeira && cotacoes ? cotacoes[c.moeda] : null;
      const motivo =
        !/^https:\/\/\S+$/.test(url) ? 'sem link https verificável' :
        vistos.has(url) ? 'duplicado' :
        num(c.preco) === null || c.preco <= 0 ? 'preço ausente ou inválido' :
        typeof c.moeda !== 'string' || !c.moeda ? 'moeda ausente' :
        estrangeira ? motivoCotacaoInvalida(cot, c.moeda, hoje, opcoes.validadeCotacaoDias) : null;
      const resto = motivo ||
        (c.idioma !== obra.idioma ? `idioma ${c.idioma} ≠ ${obra.idioma}` :
        c.genero !== obra.genero ? `gênero ${c.genero} ≠ ${obra.genero}` :
        num(c.paginas) === null ? 'tamanho desconhecido' :
        c.paginas < obra.paginas * min || c.paginas > obra.paginas * max ? `tamanho ${c.paginas} p. fora de ${Math.round(obra.paginas * min)}–${Math.round(obra.paginas * max)}` :
        typeof c.coletadoEm !== 'string' || !DATA.test(c.coletadoEm) ? 'sem data de coleta' :
        diasEntre(c.coletadoEm, hoje) > opcoes.validadeDias ? `coletado há mais de ${opcoes.validadeDias} dias` :
        diasEntre(c.coletadoEm, hoje) < 0 ? 'data de coleta no futuro' :
        null);
      if (url) vistos.add(url);
      if (resto) { descartados.push({ url: url || null, motivo: resto }); continue; }
      usados.push({
        titulo: c.titulo || null, url, coletadoEm: c.coletadoEm, paginas: c.paginas,
        // Referência internacional, conversão e preço na moeda da venda ficam separados.
        referencia: { preco: c.preco, moeda: c.moeda },
        conversao: estrangeira ? { taxa: cot.taxa, data: cot.data, fonte: cot.fonte, de: c.moeda, para: moeda } : null,
        preco: estrangeira ? centavos(c.preco * cot.taxa) : c.preco,
      });
    }
    return { usados, descartados };
  }

  /** Fator 0..1 da nota de qualidade na faixa [ini, fim]. Sem nota → null. */
  function fatorQualidade(nota, faixa) {
    const q = num(nota);
    if (q === null) return null;
    const [ini, fim] = faixa;
    return Math.max(0, Math.min(1, (q - ini) / (fim - ini)));
  }

  /**
   * Proposta de preço com a origem de cada número. Devolve sempre o diagnóstico completo;
   * `sugestao` é `null` quando falta base, com o motivo em `motivos`. Nunca publica: o dono aprova (D3).
   */
  function precificar(entrada) {
    const e = entrada || {};
    const opcoes = Object.assign({}, PADROES, e.opcoes || {});
    const erros = [];
    if (!e.moeda) erros.push('moeda é obrigatória');
    if (!e.hoje || !DATA.test(e.hoje)) erros.push('hoje deve ser AAAA-MM-DD');
    const obra = e.obra || {};
    if (!obra.genero || !obra.idioma) erros.push('obra.genero e obra.idioma são obrigatórios');
    if (num(obra.paginas) === null || obra.paginas <= 0) erros.push('obra.paginas deve ser número > 0');
    if (!['sem_historico', 'com_historico'].includes(e.historicoAutor)) erros.push('historicoAutor deve ser sem_historico|com_historico');
    if (obra.qualidade !== undefined && obra.qualidade !== null && (num(obra.qualidade) === null || obra.qualidade < 0 || obra.qualidade > 100)) {
      erros.push('obra.qualidade deve ser número de 0 a 100');
    }
    if (erros.length) return { erros };

    const politica = e.politica || (num(e.margemMinimaPct) !== null ? { margemMinimaPct: e.margemMinimaPct } : {});
    const piso = calcularPiso(e.custos, politica);
    const { usados, descartados } = filtrarComparaveis(obra, e.comparaveis, e.moeda, e.hoje, opcoes, e.cotacoes);
    const precos = usados.map(c => c.preco).sort((a, b) => a - b);
    const q = (p) => precos.length ? centavos(percentil(precos, p)) : null;
    const mercado = { n: usados.length, minimo_exigido: opcoes.minimoComparaveis,
      p25: q(0.25), mediana: q(0.5), p75: q(0.75), usados, descartados };

    const motivos = [];
    let sugestao = null, posicao = null;
    if (usados.length < opcoes.minimoComparaveis) {
      motivos.push(`mercado insuficiente: ${usados.length} comparáveis válidos, mínimo ${opcoes.minimoComparaveis}`);
    } else {
      const novo = e.historicoAutor === 'sem_historico';
      const [de, ate] = novo ? [mercado.p25, mercado.mediana] : [mercado.mediana, mercado.p75];
      const fator = fatorQualidade(obra.qualidade, opcoes.faixaQualidade);
      const alvo = centavos(de + (fator === null ? 0 : fator) * (ate - de));
      posicao = {
        faixa: novo ? 'entre p25 e mediana (autor sem histórico)' : 'entre mediana e p75 (autor com histórico)',
        de, ate, qualidade: num(obra.qualidade), fator_qualidade: fator, alvo,
        p25_referencia: mercado.p25,
        nota: fator === null ? 'qualidade não informada: alvo no início da faixa' : null,
        ajustado_ao_piso: false,
      };
      sugestao = alvo;
      if (piso.valor !== null && piso.valor > alvo) {
        if (piso.valor <= mercado.p75) {
          sugestao = piso.valor;
          posicao.ajustado_ao_piso = true;
        } else {
          sugestao = null;
          motivos.push(`o mercado não cobre o custo mínimo: piso ${piso.valor} acima do p75 ${mercado.p75}; a obra fica em rascunho`);
        }
      }
    }
    if (piso.valor === null) motivos.push(`piso desconhecido: falta ${piso.faltando.join(', ')}`);

    const venda = sugestao !== null ? distribuirVenda(sugestao, e.custos, politica) : null;
    if (venda && venda.liquido === null) motivos.push(`líquido distribuível indefinido: falta ${venda.faltando.join(', ')}`);
    const meta = venda && venda.sobra_operacao !== null ? metaMensal(e.custos && e.custos.fixoMensal, venda.sobra_operacao) : null;

    // Insumos que ainda são média de mercado (não medidos): aparecem para serem trocados.
    const estimados = Object.entries((e.custos && e.custos.origens) || {})
      .filter(([, o]) => o && o.estado !== 'medido')
      .map(([campo, o]) => ({ campo, estado: o.estado || 'estimado', fonte: o.fonte || null }));

    return {
      moeda: e.moeda,
      sugestao,
      posicao,
      venda,
      meta,
      vendas_para_diluir_producao: sugestao !== null && num(politica.limiteCustoPct) !== null
        ? vendasParaDiluir(e.custos && e.custos.producaoDaObra, sugestao, politica.limiteCustoPct) : null,
      estimados,
      // D3: proposta completa vai para o dono aprovar; nunca publica sozinha.
      pronto_para_aprovacao: motivos.length === 0,
      exige_aprovacao_do_dono: true,
      motivos,
      piso,
      mercado,
      // Só entram medidos. Vendas por preço e avaliações reais alimentam estes campos depois.
      disposicao_a_pagar: e.disposicaoAPagar || { estado: 'nao_medida' },
      valor_percebido: e.valorPercebido || { estado: 'nao_medido' },
    };
  }

  return { precificar, calcularPiso, liquidoDistribuivel, distribuirVenda, metaMensal, vendasParaDiluir,
           filtrarComparaveis, fatorQualidade, percentil, PADROES, POLITICAS };
});
