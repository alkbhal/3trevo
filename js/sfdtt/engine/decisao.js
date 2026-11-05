// ─── Núcleo de Decisão L3.5 ──────────────────────────────────────────────────
// Regras financeiras puras com fundamentação auditável, guardas de
// contraindicação e wrappers retrocompatíveis.
//
// PORTÃO DE ENTRADA: nenhuma regra R-* vai para produção sem:
//   fundamentacao completa, contraindicações codificadas e
//   testes de contraindicação (ver src/engine/__tests__/contraindicacoes.test.js)

// TODO: migrar para cron BACEN SGS série 432 (KV cache) em vez de hardcode
const CDI_MENSAL = 0.0114;  // CDI ~14.65%/a → 1.14%/mês (verificar BACEN periodicamente — última checagem: jun/2026)
const SM_2025    = 1518;     // Salário mínimo BR 2025 (Decreto 12.342/2025)

// ─── Helpers internos ─────────────────────────────────────────────────────────
function _r2(v) { return Math.round(v * 100) / 100; }
function _sumFixos(fixos) {
  if (typeof fixos === 'number') return fixos;
  return (fixos || []).reduce((s, f) => s + (f.valor || 0), 0);
}
// Taxa mensal real da dívida, como fração (0.044 = 4,4%/mês).
// `divida.juros` é a taxa de MERCADO/contratual, salva em pontos percentuais
// pelo formulário (App.jsx `divForm.juros`) — NUNCA `divida.taxaJuros` (nome
// legado, nunca populado pelos dados reais). Sem taxa informada → 0, nunca um
// valor assumido: dívida sem taxa de mercado real (ex: pensão alimentícia,
// tributo em atraso — obrigações judiciais não têm "juro contratual") não
// pode ser tratada como se rendesse 4%/mês.
function _taxaMensal(d) { return (d && d.juros > 0) ? d.juros / 100 : 0; }

// ─── Recursos de encaminhamento — citados em respostas de contraindicação ─────
const RECURSOS_INSOLVENCIA = [
  { nome: 'Defensoria Pública',        contato: '129',                      desc: 'Gratuita para baixa renda — auxílio jurídico em superendividamento' },
  { nome: 'Procon',                     contato: '151',                      desc: 'Mediação com credores — pode suspender cobranças abusivas' },
  { nome: 'Núcleo de Superendividamento (Lei 14.181/2021)', contato: 'cjf.jus.br/superendividamento', desc: 'Repactuação judicial com suspensão de juros — direito garantido por lei' },
];
const RECURSOS_SUBSISTENCIA = [
  { nome: 'CadÚnico',        contato: 'CRAS mais próximo',       desc: 'Acesso a programas sociais — Bolsa Família, Auxílio Gás, Tarifa Social' },
  { nome: 'Banco de Alimentos', contato: 'bancodealimentos.org.br', desc: 'Rede nacional de apoio alimentar emergencial' },
];

// ─── Guardas universais ───────────────────────────────────────────────────────
// Nenhum perfil ou contexto desliga estas guardas.
function _verificarUniversais(estado, regraId) {
  const renda      = estado.renda      || 0;
  const rendaAnual = estado.rendaAnual ?? (renda * 12);
  const dividaTotal = estado.dividaTotal ??
    (estado.dividas || []).filter(d => d.status !== 'quitada').reduce((s, d) => s + (d.saldo || 0), 0);

  // Insolvência grave: dívida total > 2x renda anual (guarda absoluta)
  if (rendaAnual > 0 && dividaTotal > rendaAnual * 2)
    return 'insolvencia_grave';

  // Renda de subsistência: não sugerir investimento nem quitação acelerada
  const totalFixos = _sumFixos(estado.fixos);
  if (renda > 0 && renda < totalFixos && totalFixos > 0)
    return 'renda_subsistencia';
  if (renda > 0 && renda < SM_2025 * 2)
    return 'renda_subsistencia';

  // Emergência ativa: suspende hierarquia normal
  if (estado.emergencia_ativa === true)
    return 'emergencia_ativa';

  return null;
}

function _respostaContraindicada(tipo, regraId) {
  const base = { regra_aplicada: regraId, contraindicacao: tipo, bloqueada: true, calculado_por: 'L3.5' };
  if (tipo === 'insolvencia_grave') return {
    ...base,
    principio: 'Dívida total superior a 2× a renda anual — situação de insolvência grave',
    decisao: 'encaminhar_ajuda_humana',
    mensagem_base: 'Sua situação vai além do que regras financeiras padrão conseguem resolver sozinhas. Você precisa de apoio especializado gratuito.',
    recursos: RECURSOS_INSOLVENCIA,
    nao_sugerir: ['investimento', 'quitacao_acelerada', 'parcelamento_extra'],
  };
  if (tipo === 'renda_subsistencia') return {
    ...base,
    principio: 'Renda insuficiente para cobrir o essencial — hierarquia de subsistência prevalece',
    decisao: 'foco_sobrevivencia',
    mensagem_base: 'Sua renda este mês cobre o essencial. Estratégias de investimento ou quitação acelerada não se aplicam agora — o foco é garantir o básico.',
    recursos: RECURSOS_SUBSISTENCIA,
    nao_sugerir: ['investimento', 'quitacao_acelerada'],
  };
  if (tipo === 'emergencia_ativa') return {
    ...base,
    principio: 'Emergência ativa — hierarquia financeira normal suspensa',
    decisao: 'resolver_emergencia_primeiro',
    mensagem_base: 'Com uma emergência ativa, a ordem normal de prioridades está suspensa. Resolva a emergência imediata antes de qualquer outra decisão financeira.',
    nao_sugerir: ['investimento', 'reserva', 'quitacao_acelerada'],
  };
  return { ...base, decisao: 'contraindicacao_desconhecida', mensagem_base: 'Condição não esperada detectada. Consulte apoio especializado.' };
}

// ═══════════════════════════════════════════════════════════════════════════════
// R-ALOCACAO-SALARIO
// ═══════════════════════════════════════════════════════════════════════════════
export const R_ALOCACAO_SALARIO = {
  id: 'R-ALOCACAO-SALARIO',
  versao: '1.1.0',

  fundamentacao: {
    principio: 'Hierarquia de prioridades financeiras — recursos escassos alocados pelo custo de não-pagamento',
    fontes: [
      'Pirâmide de prioridades (CFP Board / Planejar)',
      'Método 50/30/20 (Elizabeth Warren, All Your Worth, 2005)',
      'Custo de oportunidade (Mankiw, Principles of Economics, cap. 1)',
    ],
    contraindicacoes: ['insolvencia_grave', 'renda_subsistencia', 'emergencia_ativa'],
    limite: 'Decide ordem e proporção de alocação. NÃO decide se a dívida deveria ter sido contraída. NÃO substitui aconselhamento profissional em insolvência (dívida > 2× renda anual → encaminhar).',
    revisado_por: 'Rogério',
    revisado_em: '2026-05-29',
    fontes_conferidas: true,
  },

  executar(estado) {
    const contra = this.verificarContraindicacoes(estado);
    if (contra) return this.respostaContraindicada(contra);

    const renda       = estado.renda       || 0;
    const perfil      = estado.perfil      || 'controlado';
    const reservaAt   = estado.reservaAtual || 0;
    const dividas     = estado.dividas     || [];
    const vencidas    = dividas.filter(d => d.status === 'vencida' || d.status === 'inadimplente');
    const emDia       = dividas.filter(d => d.status === 'em_dia');
    const totalFixos  = _sumFixos(estado.fixos);
    const totalAssin  = _sumFixos(estado.assinaturas);
    const reservaAlvo = totalFixos * 3;
    const reservaGap  = Math.max(0, reservaAlvo - reservaAt);
    const usaBolaDeneve = perfil === 'ansioso' || perfil === 'negador';
    const metodoDivida  = usaBolaDeneve ? 'bola_de_neve' : 'avalanche';

    // Ordena vencidas pelo critério do perfil
    const vencOrd = [...vencidas].sort((a, b) =>
      usaBolaDeneve
        ? (a.saldo || 0) - (b.saldo || 0)                  // bola de neve: menor saldo primeiro
        : ((b.saldoReal?.total ?? b.saldo) || 0) - ((a.saldoReal?.total ?? a.saldo) || 0)  // avalanche: maior custo real primeiro
    );

    function mkPgto(descricao, valor, tipo, urgencia = 'media') {
      return { descricao, valor: _r2(valor), desc: descricao, tipo, urgencia };
    }

    function buildPagamentos(incluirReserva, fundoNeg = 0) {
      const p = [];
      // 1. Vencidas (sempre primeiro)
      vencOrd.forEach(d => {
        const val = _r2((d.saldoReal?.total ?? d.saldo) || 0);
        p.push(mkPgto(`${d.nome}${d.diasAtraso ? ' — vencida há ' + d.diasAtraso + 'd' : ''}`, val, 'divida_vencida', 'alta'));
      });
      // 2. Fixos essenciais
      if (typeof estado.fixos === 'number' && estado.fixos > 0) {
        p.push(mkPgto('Fixos essenciais', totalFixos, 'fixo', 'alta'));
      } else {
        (estado.fixos || []).forEach(f =>
          p.push(mkPgto(f.nome || 'Fixo', f.valor || 0, 'fixo', f.prioridade || 'alta'))
        );
      }
      // 3. Assinaturas
      (estado.assinaturas || []).forEach(a =>
        p.push(mkPgto(a.nome, a.valor || 0, 'assinatura', 'media'))
      );
      // 4. Parcelas em dia
      emDia.forEach(d => p.push(mkPgto(d.nome, d.parcela || 0, 'divida_normal', 'media')));
      // 5. Reserva (se incluída)
      if (incluirReserva && reservaGap > 0) {
        const rv = Math.min(renda * 0.10, reservaGap);
        p.push(mkPgto('Reserva emergência', rv, 'reserva', 'baixa'));
      }
      // 6. Fundo de negociação (cenário negociação)
      if (fundoNeg > 0)
        p.push(mkPgto('Fundo de negociação', fundoNeg, 'negociacao', 'baixa'));
      // 7. Discricionário
      const consumido = p.reduce((s, x) => s + x.valor, 0);
      p.push(mkPgto('Discricionário', Math.max(0, renda - consumido), 'discricionario', 'baixa'));
      return p;
    }

    const saldoVencidas = vencidas.reduce((s, d) => s + ((d.saldoReal?.total ?? d.saldo) || 0), 0);
    const essencial = totalFixos + totalAssin + emDia.reduce((s, d) => s + (d.parcela || 0), 0);

    return {
      regra_aplicada: this.id,
      principio:      this.fundamentacao.principio,
      fonte:          this.fundamentacao.fontes.join('; '),
      renda, essencial: _r2(essencial + saldoVencidas),
      excedente: _r2(Math.max(0, renda - essencial - saldoVencidas)),
      metodo_divida: metodoDivida,
      cenarios: [
        {
          id: 'estabilidade', nome: 'Estabilidade',
          descricao: 'Paga tudo em dia, constrói reserva progressivamente.',
          pagamentos: buildPagamentos(true),
          consequencia_seguir:  'Mantém score, elimina atraso, reserva cresce.',
          consequencia_ignorar: 'Vencidas seguem acumulando multa + mora.',
          mitigacao: 'Se renda cair, cortar discricionário primeiro.',
          principio: '50/30/20 adaptado ao contexto',
        },
        {
          id: 'fluxo', nome: 'Fluxo',
          descricao: 'Foca em quitar vencidas e garantir o essencial. Reserva espera.',
          pagamentos: buildPagamentos(false),
          consequencia_seguir:  'Para sangria de juros. Score melhora em ~3 meses.',
          consequencia_ignorar: 'Vencidas escalam. Risco de negativação em 30d.',
          mitigacao: 'Negociar desconto de ~40% via Serasa Limpa Nome antes de pagar valor integral.',
          principio: 'Parar sangria primeiro (Ramsey Step 0)',
        },
        {
          id: 'negociacao', nome: 'Negociação',
          descricao: 'Guarda dinheiro para negociar desconto com credores.',
          pagamentos: buildPagamentos(false, _r2(Math.min(saldoVencidas * 0.60, Math.max(0, renda * 0.30)))),
          consequencia_seguir:  'Poder de negociação de ~40% de desconto com caixa disponível.',
          consequencia_ignorar: 'Dívida cresce. Chance de desconto reduz com o tempo.',
          mitigacao: 'Ter o valor disponível na hora aumenta poder de negociação — nunca prometa sem caixa.',
          principio: 'Negociar com caixa é mais poderoso que negociar no vazio',
        },
      ],
      calculado_por: 'L3.5',
    };
  },

  verificarContraindicacoes(estado) {
    return _verificarUniversais(estado, this.id);
  },

  respostaContraindicada(tipo) {
    return _respostaContraindicada(tipo, this.id);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// R-DIVIDA-ORDEM
// ═══════════════════════════════════════════════════════════════════════════════
export const R_DIVIDA_ORDEM = {
  id: 'R-DIVIDA-ORDEM',
  versao: '1.0.0',

  fundamentacao: {
    principio: 'Ordem de quitação otimizada pelo perfil comportamental',
    fontes: [
      'Debt Snowball: Dave Ramsey, The Total Money Makeover (2003)',
      'Validação empírica: Gal & McShane, JMR 2012 — wins rápidos aumentam probabilidade de eliminar toda a dívida',
      'Debt Avalanche: otimização matemática de juros (qualquer texto de matemática financeira)',
    ],
    contraindicacoes: ['insolvencia_grave', 'renda_subsistencia'],
    limite: 'Decide ordem entre dívidas existentes. NÃO julga se contrair foi certo. NÃO negocia com credor.',
    revisado_por: 'Rogério',
    revisado_em: '2026-05-29',
    fontes_conferidas: true,
  },

  executar(estado) {
    const contra = this.verificarContraindicacoes(estado);
    if (contra) return this.respostaContraindicada(contra);

    const dividas = (estado.dividas || []).filter(d => d.status !== 'quitada' && (d.saldo || 0) > 0);
    const perfil  = estado.perfil || 'controlado';

    if (!dividas.length) return {
      regra_aplicada: this.id, principio: 'Sem dívidas ativas',
      fonte: 'N/A', decisao: [], consequencias: [], alternativas: [], calculado_por: 'L3.5',
    };

    const usaBolaDeneve = perfil === 'ansioso' || perfil === 'negador';
    const ordenadas = usaBolaDeneve
      ? [...dividas].sort((a, b) => (a.saldo || 0) - (b.saldo || 0))
      : [...dividas].sort((a, b) => _taxaMensal(b) - _taxaMensal(a));

    const semTaxa = dividas.filter(d => !(d.juros > 0));
    const jurosMensal = dividas.reduce((s, d) => s + (d.saldo || 0) * _taxaMensal(d), 0);

    // Alerta: disparidade extrema de taxa mesmo em perfil ansioso (só entre as informadas)
    const taxasInformadas = dividas.filter(d => d.juros > 0).map(_taxaMensal);
    const maxTaxa = taxasInformadas.length ? Math.max(...taxasInformadas) : 0;
    const minTaxa = taxasInformadas.length ? Math.min(...taxasInformadas) : 0;
    const alerta  = usaBolaDeneve && maxTaxa > 0.10 && maxTaxa > minTaxa * 3
      ? `Atenção: uma dívida tem taxa ${(maxTaxa*100).toFixed(1)}%/mês — cresce rápido demais para esperar. Considere atacá-la primeiro mesmo no perfil ${perfil}.`
      : null;

    return {
      regra_aplicada: this.id,
      principio: usaBolaDeneve
        ? `Perfil ${perfil}: vitórias rápidas reduzem paralisia e ansiedade financeira`
        : 'Perfil estrategista: minimizar custo total de juros',
      fonte: usaBolaDeneve
        ? 'Ramsey (2003) + Gal & McShane JMR 2012'
        : 'Debt Avalanche — custo de oportunidade mínimo',
      decisao: ordenadas.map((d, i) => ({
        ordem: i + 1, nome: d.nome, saldo: d.saldo,
        taxaMes: d.juros > 0 ? `${(_taxaMensal(d) * 100).toFixed(1)}%/mês` : 'taxa não informada',
        motivo: usaBolaDeneve
          ? `Saldo R$ ${(d.saldo||0).toFixed(0)} — quitar gera vitória concreta`
          : d.juros > 0
            ? `Taxa ${(_taxaMensal(d)*100).toFixed(1)}%/mês — maior custo, eliminar primeiro`
            : `Sem taxa de mercado informada (obrigação judicial, ex. pensão, não tem "juro contratual") — priorizada por urgência/status, não por custo`,
      })),
      alerta,
      consequencias: [
        { tipo: 'seguir',  desc: `Elimina dívidas em ordem otimizada; juros mensais estimados R$ ${jurosMensal.toFixed(0)}`
            + (semTaxa.length ? ` (${semTaxa.length} dívida${semTaxa.length > 1 ? 's' : ''} sem taxa de mercado informada, fora desse total)` : '') },
        { tipo: 'ignorar', desc: `Dívidas com taxa informada crescem R$ ${(jurosMensal * 12).toFixed(0)}/ano sem ação` },
      ],
      alternativas: [
        { nome: 'Portabilidade', quando: 'Taxa > 10%/mês — trocar por crédito mais barato antes de atacar' },
      ],
      calculado_por: 'L3.5',
    };
  },

  verificarContraindicacoes(estado) {
    return _verificarUniversais(estado, this.id);
  },

  respostaContraindicada(tipo) {
    return _respostaContraindicada(tipo, this.id);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// R-INVESTIR-OU-QUITAR
// ═══════════════════════════════════════════════════════════════════════════════
export const R_INVESTIR_OU_QUITAR = {
  id: 'R-INVESTIR-OU-QUITAR',
  versao: '1.0.0',

  fundamentacao: {
    principio: 'Custo de oportunidade: quitar só vale se o juro da dívida supera o retorno livre de risco',
    fontes: [
      'Custo de oportunidade (Mankiw, Principles of Economics, cap. 1)',
      'Regra prática: juro dívida > retorno líquido → quitar é investimento garantido (consenso CFP/ANBIMA educação)',
    ],
    contraindicacoes: ['renda_subsistencia', 'insolvencia_grave'],
    limite: 'Compara retorno financeiro. NÃO considera valor psicológico de "estar livre de dívidas". NÃO se aplica antes de existir reserva de emergência mínima — R-RESERVA tem precedência parcial.',
    revisado_por: 'Rogério',
    revisado_em: '2026-05-29',
    fontes_conferidas: true,
  },

  executar(estado) {
    const contra = this.verificarContraindicacoes(estado);
    if (contra) return this.respostaContraindicada(contra);

    const divida  = estado.divida || {};
    const taxaCDI = estado.taxaCDI ?? CDI_MENSAL;

    if (!(divida.juros > 0)) {
      return {
        regra_aplicada: this.id,
        principio: 'Comparação quitar-vs-investir exige uma taxa de mercado real da dívida',
        fonte: this.fundamentacao.fontes.join('; '),
        decisao: { acao: null, divida: divida.nome || '', taxaDivida: null, taxaCDI: `${(taxaCDI*100).toFixed(2)}%/mês`, diferenca: null,
          racional: 'Taxa de juros não informada — não é possível comparar custo de carregar a dívida contra o CDI. Obrigações sem taxa de mercado (pensão alimentícia, tributo em atraso, indenização judicial) não têm "juro contratual" — não fabricar um número aqui.' },
        consequencias: [],
        alternativas: [{ nome: 'Informar taxa', quando: 'Edite a dívida e preencha "Juros % a.m." se for crédito de mercado (empréstimo, cartão, financiamento).' }],
        calculado_por: 'L3.5',
      };
    }

    const taxaDivida  = divida.juros / 100;
    const decisaoAcao = taxaDivida > taxaCDI ? 'quitar' : 'investir';
    const diferenca   = Math.abs(taxaDivida - taxaCDI);

    return {
      regra_aplicada: this.id,
      principio:      this.fundamentacao.principio,
      fonte:          this.fundamentacao.fontes.join('; '),
      decisao: {
        acao: decisaoAcao, divida: divida.nome || '',
        taxaDivida: `${(taxaDivida*100).toFixed(2)}%/mês`,
        taxaCDI:    `${(taxaCDI*100).toFixed(2)}%/mês`,
        diferenca:  `${(diferenca*100).toFixed(2)}%/mês`,
        racional: decisaoAcao === 'quitar'
          ? `Dívida ${(taxaDivida*100).toFixed(1)}%/mês > CDI ${(taxaCDI*100).toFixed(1)}%/mês — quitar é investimento garantido sem IR`
          : `CDI ${(taxaCDI*100).toFixed(1)}%/mês ≥ dívida ${(taxaDivida*100).toFixed(1)}%/mês — pode investir o excedente`,
      },
      consequencias: [
        { tipo: 'seguir',  desc: decisaoAcao === 'quitar'
            ? `Retorno garantido de ${(taxaDivida*100).toFixed(1)}%/mês — melhor que qualquer renda fixa conservadora`
            : `Rendimento estimado ${(taxaCDI*100).toFixed(1)}%/mês` },
        { tipo: 'ignorar', desc: decisaoAcao === 'quitar'
            ? `Dívida cresce ${(taxaDivida*100).toFixed(1)}%/mês composto`
            : 'Capital parado perde para inflação' },
      ],
      alternativas: [
        { nome: 'Híbrido', quando: 'Manter reserva de emergência (3 meses) e quitar com o restante' },
      ],
      calculado_por: 'L3.5',
    };
  },

  verificarContraindicacoes(estado) {
    return _verificarUniversais(estado, this.id);
  },

  respostaContraindicada(tipo) {
    return _respostaContraindicada(tipo, this.id);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// R-RESERVA
// ═══════════════════════════════════════════════════════════════════════════════
export const R_RESERVA = {
  id: 'R-RESERVA',
  versao: '1.0.0',

  fundamentacao: {
    principio: 'Colchão de liquidez antes de risco — 3-6 meses CLT, 6-12 autônomo',
    fontes: [
      '3-6 meses de despesas: consenso CFP Board / Planejar',
      'Finanças comportamentais: Thaler & Sunstein, Nudge (2008) — reserva reduz decisões ruins sob estresse',
      'Renda instável precisa de colchão maior (Warren & Tyagi)',
    ],
    contraindicacoes: ['renda_subsistencia', 'insolvencia_grave'],
    limite: 'NÃO priorizar reserva sobre dívida com juro alto ativo. Construir reserva rendendo 0,9%/mês enquanto dívida cobra 12%/mês é perda líquida. Sequência: estancar dívida cara → reserva mínima → equilíbrio.',
    revisado_por: 'Rogério',
    revisado_em: '2026-05-29',
    fontes_conferidas: true,
  },

  executar(estado) {
    const contra = this.verificarContraindicacoes(estado);
    if (contra) return this.respostaContraindicada(contra);

    const despesaEssencial = estado.despesaEssencial || _sumFixos(estado.fixos) || 0;
    const perfil = estado.perfil || 'controlado';
    const ehAutonomo = perfil === 'autonomo' || perfil === 'estrategista';
    const mesesMin = ehAutonomo ? 6 : 3;
    const mesesMax = ehAutonomo ? 12 : 6;

    return {
      regra_aplicada: this.id,
      principio:      this.fundamentacao.principio,
      fonte:          this.fundamentacao.fontes.join('; '),
      decisao: {
        alvoMinimo: _r2(despesaEssencial * mesesMin),
        alvoMaximo: _r2(despesaEssencial * mesesMax),
        mesesMin, mesesMax,
        onde: 'CDB 100% CDI ou Tesouro SELIC — liquidez diária, cobertura FGC até R$ 250k',
        racional: ehAutonomo
          ? 'Autônomo/estrategista: renda variável exige 6–12 meses para absorver gaps entre projetos'
          : 'CLT: 3–6 meses cobre demissão sem aviso prévio + tempo médio de recolocação',
      },
      consequencias: [
        { tipo: 'seguir',  desc: 'Imprevistos resolvidos sem recorrer a crédito caro' },
        { tipo: 'ignorar', desc: `Um imprevisto de R$ ${_r2(despesaEssencial * 0.5)} vira dívida de cartão a ~15%/mês` },
      ],
      alternativas: [
        { nome: 'Reserva mínima de liquidez', quando: 'R$ 1.000 em conta corrente enquanto constrói a reserva completa' },
      ],
      calculado_por: 'L3.5',
    };
  },

  verificarContraindicacoes(estado) {
    // Guarda específica: não priorizar reserva sobre dívida cara ativa
    const dividas = estado.dividas || [];
    const dividaCara = dividas.find(d => d.status !== 'quitada' && _taxaMensal(d) > CDI_MENSAL * 5);
    if (dividaCara) return 'divida_cara_ativa';
    return _verificarUniversais(estado, this.id);
  },

  respostaContraindicada(tipo) {
    if (tipo === 'divida_cara_ativa') return {
      regra_aplicada: this.id, contraindicacao: tipo, bloqueada: true,
      principio: 'Dívida cara ativa — construir reserva enquanto paga juro alto é perda líquida',
      decisao: 'estancar_divida_primeiro',
      mensagem_base: 'Você tem uma dívida com juro muito alto. Construir reserva agora enquanto essa dívida cresce é perda líquida. Estanche a dívida cara primeiro, depois construa a reserva.',
      nao_sugerir: ['reserva_antes_de_quitar'],
      calculado_por: 'L3.5',
    };
    return _respostaContraindicada(tipo, this.id);
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// R-PARCELAR
// ═══════════════════════════════════════════════════════════════════════════════
export const R_PARCELAR = {
  id: 'R-PARCELAR',
  versao: '1.0.0',

  fundamentacao: {
    principio: 'CET vs. custo de oportunidade — parcelar só é vantajoso quando CET < CDI',
    fontes: [
      'VPL (Valor Presente Líquido) — matemática financeira básica',
      'CET (Custo Efetivo Total) — Resolução BACEN/CMN 3.517/2007',
      '"Sem juros" tem custo de oportunidade do desconto à vista',
    ],
    contraindicacoes: ['renda_subsistencia', 'perfil_impulsivo_com_parcelas_acumuladas'],
    limite: 'Avalia a matemática de uma compra. NÃO julga se a compra é necessária — isso é decisão do usuário.',
    revisado_por: 'Rogério',
    revisado_em: '2026-05-29',
    fontes_conferidas: true,
  },

  executar(estado) {
    const contra = this.verificarContraindicacoes(estado);
    if (contra) return this.respostaContraindicada(contra);

    const { valor, parcelas, juros, taxaCDI = CDI_MENSAL } = estado;
    if (!valor || valor <= 0 || !parcelas || parcelas <= 0) return null;

    const taxaJuros = juros || 0;
    let pmt, totalPago, jurosTotal;
    if (taxaJuros > 0) {
      pmt       = valor * (taxaJuros / (1 - Math.pow(1 + taxaJuros, -parcelas)));
      totalPago = pmt * parcelas;
      jurosTotal = totalPago - valor;
    } else {
      pmt = valor / parcelas; totalPago = valor; jurosTotal = 0;
    }

    let vpParcelas = 0;
    for (let i = 1; i <= parcelas; i++) vpParcelas += pmt / Math.pow(1 + taxaCDI, i);

    const ganhoInvest  = valor * (Math.pow(1 + taxaCDI, parcelas) - 1);
    const decisaoAcao  = taxaJuros > taxaCDI ? 'pagar_avista' : 'parcelar_sem_juros';

    return {
      regra_aplicada: this.id,
      principio:      this.fundamentacao.principio,
      fonte:          this.fundamentacao.fontes.join('; '),
      decisao: {
        acao: decisaoAcao, valor, parcelas,
        pmt:                   _r2(pmt),
        totalPago:             _r2(totalPago),
        jurosTotal:            _r2(jurosTotal),
        cet:                   `${(taxaJuros*100).toFixed(2)}%/parcela`,
        custoPresenteParcelas: _r2(vpParcelas),
        racional: decisaoAcao === 'pagar_avista'
          ? `Juro ${(taxaJuros*100).toFixed(1)}%/mês > CDI ${(taxaCDI*100).toFixed(1)}%/mês — parcelar custa mais do que investir o valor`
          : `Sem juro acima do CDI — parcelar libera caixa sem custo adicional`,
      },
      consequencias: [
        { tipo: 'seguir',  desc: decisaoAcao === 'pagar_avista'
            ? `Economiza R$ ${Math.round(jurosTotal)} em juros`
            : `Mantém R$ ${Math.round(valor)} investido → ~R$ ${Math.round(ganhoInvest)} de rendimento em ${parcelas} meses` },
        { tipo: 'ignorar', desc: decisaoAcao === 'pagar_avista'
            ? `Paga R$ ${Math.round(jurosTotal)} a mais no total`
            : 'Oportunidade de manter capital investido perdida' },
      ],
      alternativas: [
        { nome: 'Negociar desconto à vista', quando: 'Perguntar desconto por pagamento imediato — geralmente 5-15%' },
      ],
      calculado_por: 'L3.5',
    };
  },

  verificarContraindicacoes(estado) {
    // Perfil impulsivo com muitas parcelas ativas já é um risco adicional
    const perfil  = estado.perfil || '';
    const dividas = estado.dividas || [];
    const parcAtivas = dividas.filter(d => d.status !== 'quitada').length;
    if (perfil === 'impulsivo' && parcAtivas >= 4) return 'perfil_impulsivo_com_parcelas_acumuladas';
    return _verificarUniversais(estado, this.id);
  },

  respostaContraindicada(tipo) {
    if (tipo === 'perfil_impulsivo_com_parcelas_acumuladas') return {
      regra_aplicada: this.id, contraindicacao: tipo, bloqueada: false,
      principio: 'Perfil impulsivo com parcelas acumuladas — risco de comprometimento de fluxo',
      decisao: 'alertar_antes_de_parcelar',
      mensagem_base: 'Você já tem várias parcelas ativas. Adicionar mais pode comprometer o fluxo dos próximos meses. Revise o orçamento antes de confirmar.',
      nao_sugerir: ['parcelamento_adicional_sem_revisao'],
      calculado_por: 'L3.5',
    };
    return _respostaContraindicada(tipo, this.id);
  },
};

// ─── Wrappers retrocompatíveis (mantêm API original) ──────────────────────────
// Aceitam tanto estado-objeto quanto parâmetros individuais.

function _buildEstadoAlocacao(rendaOrEstado, dividas, fixos, reservaAtual, perfil, ctx = {}) {
  if (rendaOrEstado && typeof rendaOrEstado === 'object' && !Array.isArray(rendaOrEstado))
    return rendaOrEstado;
  const divs = dividas || [];
  return {
    renda: rendaOrEstado,
    rendaAnual: (rendaOrEstado || 0) * 12,
    dividas: divs,
    dividaTotal: divs.filter(d => d.status !== 'quitada').reduce((s, d) => s + (d.saldo || 0), 0),
    fixos: typeof fixos === 'number' ? fixos : (fixos || []),
    reservaAtual: reservaAtual || 0,
    perfil: perfil || 'controlado',
    emergencia_ativa: ctx.emergencia_ativa || false,
  };
}

export function rAlocacaoSalario(rendaOrEstado, dividas, fixos, reservaAtual, perfil, ctx = {}) {
  return R_ALOCACAO_SALARIO.executar(_buildEstadoAlocacao(rendaOrEstado, dividas, fixos, reservaAtual, perfil, ctx));
}

export function rDividaOrdem(dividasOrEstado, perfil, ctx = {}) {
  if (dividasOrEstado && !Array.isArray(dividasOrEstado) && typeof dividasOrEstado === 'object')
    return R_DIVIDA_ORDEM.executar(dividasOrEstado);
  return R_DIVIDA_ORDEM.executar({ dividas: dividasOrEstado, perfil, ...ctx });
}

export function rInvestirOuQuitar(dividaOrEstado, taxaCDI = CDI_MENSAL) {
  if (dividaOrEstado && typeof dividaOrEstado === 'object' && 'divida' in dividaOrEstado)
    return R_INVESTIR_OU_QUITAR.executar(dividaOrEstado);
  return R_INVESTIR_OU_QUITAR.executar({ divida: dividaOrEstado, taxaCDI });
}

export function rReserva(despesaOuEstado, perfil) {
  if (despesaOuEstado && typeof despesaOuEstado === 'object' && ('dividas' in despesaOuEstado || 'fixos' in despesaOuEstado))
    return R_RESERVA.executar(despesaOuEstado);
  return R_RESERVA.executar({ despesaEssencial: despesaOuEstado, perfil });
}

export function rParcelar(valorOrEstado, parcelas, juros, saldo, taxaCDI = CDI_MENSAL) {
  if (valorOrEstado && typeof valorOrEstado === 'object' && 'valor' in valorOrEstado)
    return R_PARCELAR.executar(valorOrEstado);
  return R_PARCELAR.executar({ valor: valorOrEstado, parcelas, juros, saldo, taxaCDI });
}
