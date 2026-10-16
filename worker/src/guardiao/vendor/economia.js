/**
 * GUARDIÃO — CONTRATO ECONÔMICO, comum a todos os projetos TT que chamam modelos pagos.
 *
 * Três peças, sem dependência e sem build (UMD, como o núcleo):
 *   1. Catálogo de preços versionado: cada preço tem fonte e data de verificação.
 *      Modelo fora do catálogo ou não verificado → custo `null`, NUNCA um preço padrão.
 *   2. Registro de execução: o que rodou, quanto gastou (estimado E reportado, separados)
 *      e que sinais de qualidade existem — o estado do PR é só um deles.
 *   3. Portão de orçamento: reserva o valor ANTES da chamada, numa única instrução SQL
 *      (atômica no SQLite/D1), e recusa quando a soma passaria do teto. Sem teto
 *      configurado, recusa (fail-closed).
 *
 * O que este módulo NÃO garante: teto financeiro absoluto. Ele só vê o que passa por
 * ele; atraso de faturamento, cache, ferramentas e tarifas extras do provedor ficam
 * fora. O limite definitivo é o do painel de cobrança de cada provedor.
 *
 * NÃO edite a cópia vendida num projeto: melhoria vai para o repositório `guardiao`.
 */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.GuardiaoEconomia = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const DATA = /^\d{4}-\d{2}-\d{2}$/;

  // ── 1. Catálogo de preços ─────────────────────────────────────────────────

  /** Lista de problemas do catálogo; vazia = válido. */
  function validarCatalogo(cat) {
    const p = [];
    if (!cat || typeof cat !== 'object') return ['catálogo ausente'];
    if (!/^\d+\.\d+\.\d+$/.test(cat.versao || '')) p.push('versao semver ausente');
    if (cat.moeda !== 'USD') p.push('moeda precisa ser USD (única suportada)');
    if (!Array.isArray(cat.itens)) return p.concat('itens ausente');
    const vistos = new Set();
    cat.itens.forEach((it, i) => {
      const id = `${it.provedor}/${it.modelo}`;
      const onde = `itens[${i}] ${id}`;
      if (!it.provedor || !it.modelo) p.push(`${onde}: provedor e modelo são obrigatórios`);
      for (const nome of [it.modelo, ...(it.aliases || [])]) {
        const chave = `${it.provedor}/${nome}`;
        if (vistos.has(chave)) p.push(`${onde}: ${chave} repetido`);
        vistos.add(chave);
      }
      if (!['verificado', 'nao_verificado'].includes(it.estado)) p.push(`${onde}: estado deve ser verificado|nao_verificado`);
      if (it.estado === 'verificado') {
        for (const c of ['entrada_por_mtok', 'saida_por_mtok']) if (!(num(it[c]) > 0)) p.push(`${onde}: ${c} positivo é obrigatório`);
        if (!it.fonte) p.push(`${onde}: fonte é obrigatória`);
        if (!DATA.test(it.verificado_em || '')) p.push(`${onde}: verificado_em AAAA-MM-DD é obrigatório`);
      }
      if (it.vigente_desde && !DATA.test(it.vigente_desde)) p.push(`${onde}: vigente_desde inválido`);
      if (it.vigente_ate && !DATA.test(it.vigente_ate)) p.push(`${onde}: vigente_ate inválido`);
    });
    return p;
  }

  /** Item vigente do catálogo para (provedor, modelo) na data `dia` (AAAA-MM-DD), ou null. */
  const hoje = () => new Date().toISOString().slice(0, 10);

  function precoDe(cat, provedor, modelo, dia) {
    const d = dia || hoje();
    return (cat.itens || []).find(it =>
      it.provedor === provedor &&
      (it.modelo === modelo || (it.aliases || []).includes(modelo)) &&
      (!it.vigente_desde || it.vigente_desde <= d) &&
      (!it.vigente_ate || d <= it.vigente_ate)) || null;
  }

  /**
   * Custo estimado em USD a partir dos tokens. `null` quando não dá para saber:
   * modelo fora do catálogo, preço não verificado ou tokens ilegíveis. Zero afirmaria
   * "não custou nada"; null afirma "ninguém sabe".
   */
  function custoEstimado(item, uso) {
    if (!item || item.estado !== 'verificado' || !uso) return null;
    const ent = num(uso.tokens_entrada), sai = num(uso.tokens_saida);
    if (ent === null || sai === null || ent < 0 || sai < 0) return null;
    // Preço escalonado (ex.: tarifa maior acima de N tokens de entrada): fora da faixa verificada, não se estima.
    if (num(item.limite_entrada_tokens) !== null && ent > item.limite_entrada_tokens) return null;
    const cache = num(uso.tokens_cache_leitura) || 0;
    const precoCache = num(item.cache_leitura_por_mtok);
    if (cache > 0 && precoCache === null) return null; // há cache e o preço dele não foi verificado
    return (ent * item.entrada_por_mtok + sai * item.saida_por_mtok + cache * (precoCache || 0)) / 1e6;
  }

  // ── 2. Registro de execução ───────────────────────────────────────────────

  const TESTES = ['passou', 'falhou', 'nao_rodou'];
  const PR = ['aberto', 'mesclado', 'fechado', 'revertido'];

  /**
   * Monta um registro de execução validado. Devolve { registro } ou { erros }.
   * custo_reportado = o que o provedor informou (telemetria/faturamento), nunca o estimado.
   */
  function registrarExecucao(cat, e) {
    const erros = [];
    for (const c of ['projeto', 'tarefa', 'provedor', 'modelo']) if (!e || !e[c]) erros.push(`${c} é obrigatório`);
    if (erros.length) return { erros };
    // `dia` da chamada (AAAA-MM-DD; aceita o created_at do D1, 'AAAA-MM-DD HH:MM:SS'). Sem dia = hoje.
    const dia = e.dia == null ? null : String(e.dia).slice(0, 10);
    if (dia !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { erros: ['dia deve ser AAAA-MM-DD'] };
    const item = precoDe(cat, e.provedor, e.modelo, dia);
    const testes = e.testes == null ? 'nao_rodou' : e.testes;
    if (!TESTES.includes(testes)) erros.push(`testes deve ser ${TESTES.join('|')}`);
    if (e.estado_pr != null && !PR.includes(e.estado_pr)) erros.push(`estado_pr deve ser ${PR.join('|')} ou null`);
    const reportado = e.custo_reportado == null ? null : num(e.custo_reportado);
    if (e.custo_reportado != null && (reportado === null || reportado < 0)) erros.push('custo_reportado inválido');
    if (erros.length) return { erros };
    return {
      registro: Object.freeze({
        projeto: e.projeto, tarefa: e.tarefa, provedor: e.provedor, modelo: e.modelo,
        tokens_entrada: num(e.tokens_entrada), tokens_saida: num(e.tokens_saida),
        custo_estimado: custoEstimado(item, e),
        custo_reportado: reportado,
        custo_legado: num(e.custo_legado), // valor que o projeto calculava por conta própria, só para comparação
        versao_catalogo: cat.versao,
        preco_verificado_em: item && item.estado === 'verificado' ? item.verificado_em : null,
        // O catálogo sabe o preço do dia em que foi conferido, não o de antes. Chamada anterior à
        // conferência usa esse preço por suposição (preço não mudou), e o registro diz isso.
        // null = não se aplica (sem preço verificado).
        preco_retroativo: item && item.estado === 'verificado' && item.verificado_em
          ? (dia || hoje()) < item.verificado_em : null,
        testes, estado_pr: e.estado_pr == null ? null : e.estado_pr,
        sinais_qualidade: Object.freeze([...(e.sinais_qualidade || [])]),
      }),
    };
  }

  /** Converte o LLMUsage do tr3vo-forge (lib/llm/router.ts) num registro. O cost_usd dele vira custo_legado. */
  function deUsoForge(cat, uso, ctx) {
    return registrarExecucao(cat, {
      ...ctx, provedor: 'anthropic', modelo: uso && uso.model,
      tokens_entrada: uso && uso.input_tokens, tokens_saida: uso && uso.output_tokens,
      custo_legado: uso && uso.cost_usd,
    });
  }

  // ── 3. Portão de orçamento ────────────────────────────────────────────────
  //
  // Executor SQL assíncrono: { run(sql, ...params) → {changes}, get(sql, ...params) → linha|null,
  // exec(sql) }. `executorD1(env.DB)` adapta o D1; nos testes, node:sqlite.
  //
  // Dinheiro é guardado em MICRO-DÓLARES INTEIROS (US$ 1 = 1.000.000). Somar REAL dá
  // 0,1 + 0,1 + 0,1 = 0,30000000000000004 e recusa a terceira reserva de um teto de 0,30.

  const MICRO = 1e6;
  const paraMicro = usd => Math.round(usd * MICRO);
  const paraUsd = micro => micro / MICRO;

  const ESQUEMA = `
    CREATE TABLE IF NOT EXISTS orcamento_tetos (
      escopo TEXT PRIMARY KEY,
      teto_micro INTEGER NOT NULL CHECK (teto_micro >= 0)
    );
    CREATE TABLE IF NOT EXISTS orcamento_reservas (
      id TEXT PRIMARY KEY,
      escopo TEXT NOT NULL REFERENCES orcamento_tetos (escopo),
      reservado_micro INTEGER NOT NULL CHECK (reservado_micro > 0),
      gasto_micro INTEGER,
      estado TEXT NOT NULL CHECK (estado IN ('reservado', 'confirmado', 'liberado')),
      sem_telemetria INTEGER NOT NULL DEFAULT 0,
      abandonada INTEGER NOT NULL DEFAULT 0,
      criado_em TEXT NOT NULL
    );`;

  // O que conta contra o teto: reservas em aberto pelo valor reservado; confirmadas pelo gasto.
  const COMPROMETIDO = `COALESCE((SELECT SUM(CASE estado WHEN 'reservado' THEN reservado_micro WHEN 'confirmado' THEN gasto_micro ELSE 0 END)
                          FROM orcamento_reservas WHERE escopo = ?), 0)`;

  function criarPortao(db, { agora = () => new Date().toISOString(), novoId } = {}) {
    const id = novoId || (() => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()));
    return {
      async preparar() { await db.exec(ESQUEMA); },

      async definirTeto(escopo, tetoUsd) {
        if (!escopo || !(num(tetoUsd) >= 0)) throw new Error('teto inválido');
        await db.run(`INSERT INTO orcamento_tetos (escopo, teto_micro) VALUES (?, ?)
                      ON CONFLICT (escopo) DO UPDATE SET teto_micro = excluded.teto_micro`, escopo, paraMicro(tetoUsd));
      },

      /**
       * Reserva `valorUsd` no escopo numa única instrução: insere só se o comprometido + o pedido
       * couber no teto. `chave` (opcional) torna a reserva idempotente: repetir o mesmo pedido
       * (retry, evento duplicado) devolve a reserva existente em vez de criar outra.
       * Devolve { ok:true, id, repetida? } ou { ok:false, motivo }.
       */
      async reservar(escopo, valorUsd, { chave } = {}) {
        const v = num(valorUsd);
        if (v === null || v <= 0 || paraMicro(v) <= 0) return { ok: false, motivo: 'valor_invalido' }; // custo desconhecido não passa
        const micro = paraMicro(v);
        const novo = chave || id();
        const r = await db.run(
          `INSERT OR IGNORE INTO orcamento_reservas (id, escopo, reservado_micro, estado, criado_em)
           SELECT ?, t.escopo, ?, 'reservado', ? FROM orcamento_tetos t
           WHERE t.escopo = ? AND ${COMPROMETIDO} + ? <= t.teto_micro`,
          novo, micro, agora(), escopo, escopo, micro);
        if (r.changes === 1) return { ok: true, id: novo };
        if (chave) {
          const ja = await db.get('SELECT escopo, reservado_micro FROM orcamento_reservas WHERE id = ?', chave);
          if (ja) {
            if (ja.escopo !== escopo || ja.reservado_micro !== micro) return { ok: false, motivo: 'chave_em_uso' };
            return { ok: true, id: chave, repetida: true };
          }
        }
        const teto = await db.get('SELECT teto_micro FROM orcamento_tetos WHERE escopo = ?', escopo);
        return { ok: false, motivo: teto ? 'teto_atingido' : 'sem_teto' };
      },

      /**
       * Confirma o gasto real. Sem telemetria (null), conta o valor reservado inteiro e marca
       * `sem_telemetria` até uma reconciliação explícita. Repetir a confirmação dá erro e não
       * conta duas vezes.
       */
      async confirmar(reservaId, gastoUsd) {
        const g = gastoUsd == null ? null : num(gastoUsd);
        if (gastoUsd != null && (g === null || g < 0)) throw new Error('gasto inválido');
        const r = await db.run(
          `UPDATE orcamento_reservas SET estado = 'confirmado',
             gasto_micro = COALESCE(?, reservado_micro), sem_telemetria = ?
           WHERE id = ? AND estado = 'reservado'`, g === null ? null : paraMicro(g), g === null ? 1 : 0, reservaId);
        if (r.changes !== 1) throw new Error('reserva inexistente ou já encerrada');
      },

      /** Libera a reserva de uma chamada que comprovadamente não aconteceu. Repetir dá erro e não devolve duas vezes. */
      async liberar(reservaId) {
        const r = await db.run(`UPDATE orcamento_reservas SET estado = 'liberado' WHERE id = ? AND estado = 'reservado'`, reservaId);
        if (r.changes !== 1) throw new Error('reserva inexistente ou já encerrada');
      },

      /**
       * Reconciliação explícita: troca o valor conservador de uma execução sem telemetria pelo
       * gasto apurado no faturamento. Só vale para reservas confirmadas com `sem_telemetria`.
       */
      async reconciliar(reservaId, gastoUsd) {
        const g = num(gastoUsd);
        if (g === null || g < 0) throw new Error('gasto inválido');
        const r = await db.run(
          `UPDATE orcamento_reservas SET gasto_micro = ?, sem_telemetria = 0
           WHERE id = ? AND estado = 'confirmado' AND sem_telemetria = 1`, paraMicro(g), reservaId);
        if (r.changes !== 1) throw new Error('só se reconcilia execução confirmada sem telemetria');
      },

      /**
       * Encerra reservas abandonadas (processo morreu antes de confirmar) criadas antes de
       * `antesDe` (ISO). NUNCA devolve o dinheiro: a chamada pode ter acontecido. Elas viram
       * confirmadas pelo valor reservado, sem telemetria, à espera de reconciliação.
       * Escolha `antesDe` maior que a duração máxima de uma chamada. Devolve quantas encerrou.
       */
      async encerrarAbandonadas(escopo, antesDe) {
        if (!escopo || !antesDe) throw new Error('escopo e antesDe são obrigatórios');
        const r = await db.run(
          `UPDATE orcamento_reservas SET estado = 'confirmado', gasto_micro = reservado_micro,
             sem_telemetria = 1, abandonada = 1
           WHERE escopo = ? AND estado = 'reservado' AND criado_em < ?`, escopo, antesDe);
        return r.changes;
      },

      async saldo(escopo) {
        const l = await db.get(`SELECT t.teto_micro AS teto, ${COMPROMETIDO} AS comprometido,
                                  (SELECT COUNT(*) FROM orcamento_reservas WHERE escopo = ? AND sem_telemetria = 1) AS sem_telemetria,
                                  (SELECT COUNT(*) FROM orcamento_reservas WHERE escopo = ? AND estado = 'reservado') AS em_aberto
                                FROM orcamento_tetos t WHERE t.escopo = ?`, escopo, escopo, escopo, escopo);
        if (!l) return null;
        // Gasto real acima da reserva pode estourar o teto depois do fato: o saldo mostra negativo, não zero.
        return { teto: paraUsd(l.teto), comprometido: paraUsd(l.comprometido), disponivel: paraUsd(l.teto - l.comprometido),
                 sem_telemetria: l.sem_telemetria, em_aberto: l.em_aberto };
      },
    };
  }

  /** Adapta um binding D1 do Cloudflare ao executor do portão. */
  function executorD1(d1) {
    return {
      exec: async sql => { for (const s of sql.split(';').map(x => x.trim()).filter(Boolean)) await d1.prepare(s).run(); },
      run: async (sql, ...p) => { const r = await d1.prepare(sql).bind(...p).run(); return { changes: r.meta.changes }; },
      get: (sql, ...p) => d1.prepare(sql).bind(...p).first(),
    };
  }

  return { validarCatalogo, precoDe, custoEstimado, registrarExecucao, deUsoForge, criarPortao, executorD1, ESQUEMA };
});
