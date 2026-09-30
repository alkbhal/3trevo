/**
 * GUARDIÃO — NÚCLEO (G-001..G-005), comum a todos os projetos TT.
 *
 * Um único arquivo, sem dependência e sem build (UMD): roda em Node (`require`),
 * em navegador (`<script>` → `GuardiaoCore`) e em Worker/bundler (`import`).
 * Nasceu no Amigo Entregador; unifica o motor de lá (síncrono, guarda de
 * storage) e o do 3Trevo (assíncrono). NÃO edite a cópia vendida dentro de um
 * projeto: melhoria vai para o repositório `guardiao`, ganha versão, e os
 * projetos rodam `guardiao sync`. `guardiao deriva` acusa cópia editada.
 *
 * O que o núcleo NÃO contém: nenhum invariante. Invariantes são dado de cada
 * projeto (catálogo + contrato). Aqui só existe o mecanismo que os percorre.
 *
 * Princípios (cada um veio de uma falha real — ver APRENDIZADOS.md):
 *  - 4 níveis: 🔴 violação · 🟠 divergente · 🟡 não confirmado · 🟢 confirmado
 *  - "não sei ainda" nunca vira OK (requisito ausente, consulta que falhou,
 *    nível desconhecido → 🟡). Exceção dentro do check → 🟠, não 🟡.
 *  - o executor percorre a lista CONTRATADA, não a do catálogo: invariante
 *    prometido e removido aparece 🔴 em vez de sumir.
 *  - meta-check `catalogo_integro`: contrato == catálogo.
 *  - guardas (opcionais) podem rebaixar um resultado a 🔴 e emitir meta-check.
 */
(function (raiz, fabrica) {
  'use strict';
  var api = fabrica();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.GuardiaoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSAO = '0.1.1';

  var NIVEL_ORDEM = { violacao: 0, divergente: 1, nao_confirmado: 2, confirmado: 3 };
  var NIVEL_ICONE = { violacao: '🔴', divergente: '🟠', nao_confirmado: '🟡', confirmado: '🟢' };
  var NIVEL_LABEL = { violacao: 'violação', divergente: 'divergente', nao_confirmado: 'não confirmado', confirmado: 'confirmado' };
  var tem = Object.prototype.hasOwnProperty;

  function statusGeral(resultados) {
    function ha(n) { return resultados.some(function (x) { return x.nivel === n; }); }
    if (ha('violacao')) return { status: 'bloqueio', icone: '🔴', titulo: 'BLOQUEIO — não considerar esta versão concluída', texto: 'Pelo menos uma regra protegida foi contrariada. Corrija antes de seguir em frente.' };
    if (ha('divergente')) return { status: 'nao_concluido', icone: '🟠', titulo: 'NÃO CONCLUÍDO — revisar itens divergentes', texto: 'O resultado observado não bate com o esperado, ou um check não pôde ser avaliado, em pelo menos um item.' };
    if (ha('nao_confirmado')) return { status: 'atencao', icone: '🟡', titulo: 'ATENÇÃO — parte do contrato ainda sem evidência', texto: "Nada quebrado, mas nem tudo que o contrato promete foi verificado nesta execução — 'não sei ainda' não é 'OK'." };
    return { status: 'ok', icone: '🟢', titulo: 'OK — todo o catálogo verificado confirma o contrato', texto: 'Todos os invariantes contratados foram verificados e bateram.' };
  }

  // ─── PADRÃO HISTÓRICO ──────────────────────────────────────────────────────
  function ocorrenciasDe(id, historico) {
    var lista = [];
    (historico || []).forEach(function (h) {
      var item = (h.resultados || []).filter(function (x) { return x.id === id; })[0];
      if (item) lista.push(item.nivel);
    });
    return lista;
  }
  function contarMudancas(seq) {
    var n = 0;
    for (var i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) n++;
    return n;
  }
  function problematico(n) { return n !== 'confirmado'; }

  function classificarPadrao(id, nivelAtual, historico) {
    var oc = ocorrenciasDe(id, historico);
    if (!oc.length) return null;
    var ultimo = oc[oc.length - 1];
    var ordAtual = NIVEL_ORDEM[nivelAtual], ordUltimo = NIVEL_ORDEM[ultimo];
    var problematicasAntes = oc.filter(problematico).length;
    var mudancas = contarMudancas(oc.concat([nivelAtual]));
    if (mudancas >= 3 && problematico(nivelAtual)) return { tipo: 'oscilante', mudancas: mudancas, de: ultimo };
    if (ordAtual < ordUltimo) return problematicasAntes === 0 ? { tipo: 'primeira_ocorrencia', de: ultimo } : { tipo: 'regrediu', de: ultimo };
    if (ordAtual > ordUltimo) return nivelAtual === 'confirmado' ? { tipo: 'resolvido', de: ultimo } : { tipo: 'melhorou', de: ultimo };
    if (problematico(nivelAtual)) {
      if (problematicasAntes === oc.length) return { tipo: 'persistente', execucoes: oc.length + 1 };
      return { tipo: 'recorrente', vezes: problematicasAntes + 1 };
    }
    return { tipo: 'estavel' };
  }

  function calcularRisco(id, nivelAtual, historico) {
    var oc = ocorrenciasDe(id, historico);
    if (oc.length < 2) return null;
    var seq = oc.concat([nivelAtual]);
    var mudancas = contarMudancas(seq);
    return { execucoes: seq.length, mudancas: mudancas, problematicas: seq.filter(problematico).length, instabilidade: mudancas / (seq.length - 1) };
  }

  // ─── MONTAGEM DO RESULTADO ─────────────────────────────────────────────────
  function montar(def, quando, parcial) {
    // Nível desconhecido NUNCA vira silêncio: sem nível não há veredito, e um
    // resultado invisível para statusGeral produziria um falso verde por omissão.
    if (!parcial || !tem.call(NIVEL_ICONE, parcial.nivel)) {
      var declarado = parcial ? parcial.nivel : undefined;
      parcial = {
        nivel: 'nao_confirmado',
        titulo: (parcial && parcial.titulo) || ('Check devolveu resultado sem nível: ' + def.id),
        explicacao: 'O check rodou mas não declarou em que estado terminou. Sem nível não há veredito — tratado como não confirmado, nunca como OK.',
        resultadoObservado: 'nível devolvido: ' + String(declarado),
        acaoRecomendada: 'Revisar o retorno de ' + def.id + ' no catálogo: todo caminho precisa devolver nivel.'
      };
    }
    return {
      id: def.id,
      categoria: def.categoria,
      quando: quando,
      confianca: parcial.confianca || def.confianca || null,
      nivel: parcial.nivel,
      titulo: parcial.titulo,
      explicacao: parcial.explicacao,
      regra: def.regra,
      entrada: parcial.entrada !== undefined ? parcial.entrada : (def.entrada || null),
      resultadoEsperado: def.resultadoEsperado,
      resultadoObservado: parcial.resultadoObservado,
      impacto: def.impacto || [],
      acaoRecomendada: parcial.acaoRecomendada || null,
      testeConfirmacao: parcial.testeConfirmacao || def.testeConfirmacao || null
    };
  }

  function ausenteDoCatalogo(id, quando) {
    return montar({ id: id, categoria: 'Catálogo', regra: 'invariante declarado como contratado deve existir no catálogo', entrada: 'busca por id no catálogo', resultadoEsperado: 'entrada presente', impacto: ['Integridade do próprio Guardião'] }, quando, {
      nivel: 'violacao',
      titulo: 'Invariante contratado não existe no catálogo do Guardião: ' + id,
      explicacao: 'O contrato afirma que este invariante é protegido, mas o Guardião não tem nenhum check com esse id. Ou o check foi removido sem atualizar o contrato, ou o contrato promete uma proteção que não existe. Nos dois casos, o sistema afirma mais do que verifica.',
      resultadoObservado: 'ausente do catálogo',
      acaoRecomendada: 'Restaurar o check no catálogo, ou remover o id dos contratados explicando por quê.'
    });
  }

  // Pré-condições de um check. Devolve um parcial 🟡 se não puder rodar, senão null.
  //  - def.requer: chaves do contexto que precisam ser "truthy"
  //  - def.exige:  capacidades (opts.capacidades) que o ambiente precisa ter
  function naoPodeRodar(def, ctx, opts) {
    var faltandoCtx = (def.requer || []).filter(function (k) { return !ctx[k]; });
    if (faltandoCtx.length) {
      return {
        nivel: 'nao_confirmado',
        titulo: 'Não verificado: falta configuração — ' + def.id,
        explicacao: 'Este invariante depende de ' + faltandoCtx.join(', ') + ', que não está disponível nesta execução. Não foi verificado, e por isso não pode ser tratado como saudável.',
        entrada: 'não executado (requisito ausente)',
        resultadoObservado: 'faltando: ' + faltandoCtx.join(', ')
      };
    }
    var caps = (opts && opts.capacidades) || [];
    var faltandoCap = (def.exige || []).filter(function (c) { return caps.indexOf(c) === -1; });
    if (faltandoCap.length) {
      return {
        nivel: 'nao_confirmado',
        titulo: 'Não verificado aqui: ' + def.id,
        explicacao: 'Este invariante exige "' + faltandoCap.join(', ') + '", que este ambiente não oferece. Não foi verificado, e por isso não pode ser tratado como saudável. Rode-o onde a capacidade existe (ex.: CLI/CI).',
        entrada: 'não executado (capacidade ausente)',
        resultadoObservado: 'não executado; capacidade faltando: ' + faltandoCap.join(', ')
      };
    }
    return null;
  }

  function excecao(def, e) {
    // Falhar ao rodar é diferente de não ter rodado: 🟠, não 🟡.
    return {
      nivel: 'divergente',
      titulo: 'O check lançou exceção ao ser executado: ' + def.id,
      explicacao: 'O invariante não pôde ser avaliado porque o próprio check quebrou. Pode ser bug no check ou mudança na API do que ele verifica — nos dois casos, a proteção não está funcionando.',
      resultadoObservado: 'exceção: ' + ((e && e.message) || String(e)),
      acaoRecomendada: 'Revisar o check ' + def.id + ' e o que ele consulta.'
    };
  }

  // ─── GUARDAS (extensão) ────────────────────────────────────────────────────
  // guarda = { nome, iniciar(), antes(def, ctx) → estado, depois(def, estado, parcial) →
  //            null | parcialRebaixado, meta() → {def, parcial} | null, encerrar() }
  function guardasDe(opts) { return (opts && opts.guardas) || []; }
  function iniciarGuardas(gs) { gs.forEach(function (g) { if (g.iniciar) g.iniciar(); }); }
  function antesGuardas(gs, def, ctx) { return gs.map(function (g) { return g.antes ? g.antes(def, ctx) : undefined; }); }
  function depoisGuardas(gs, estados, def, parcial) {
    for (var i = 0; i < gs.length; i++) {
      var reb = gs[i].depois ? gs[i].depois(def, estados[i], parcial) : null;
      if (reb) return reb;
    }
    return parcial;
  }

  function finalizar(catalogo, contratados, porId, duplicados, resultados, quando, gs) {
    var idsCatalogo = catalogo.map(function (d) { return d.id; });
    var naoContratados = idsCatalogo.filter(function (id) { return contratados.indexOf(id) === -1; });
    var ausentes = contratados.filter(function (id) { return !porId[id]; });
    var integro = !ausentes.length && !naoContratados.length && !duplicados.length;
    resultados.push(montar({
      id: 'catalogo_integro', categoria: 'Catálogo',
      regra: 'o conjunto de checks tem que ser exatamente o conjunto de invariantes declarado no contrato — sem ausentes, sem duplicados, sem check não declarado',
      entrada: 'contratados (' + contratados.length + ') comparados ao catálogo (' + idsCatalogo.length + ')',
      resultadoEsperado: contratados.length + ' invariantes, 0 ausentes, 0 duplicados, 0 não declarados',
      impacto: ['Integridade do próprio Guardião', 'Validade de qualquer conclusão tirada das outras verificações']
    }, quando, {
      nivel: integro ? 'confirmado' : 'violacao',
      titulo: integro ? 'Catálogo íntegro: os ' + contratados.length + ' invariantes contratados existem e foram avaliados' : 'Catálogo divergente do contrato',
      explicacao: integro
        ? 'O contrato declara exatamente os invariantes que o Guardião executa: nenhum sumiu em silêncio.'
        : 'O que o contrato promete e o que o Guardião executa não são a mesma coisa. Enquanto isso não bater, nenhuma conclusão das outras verificações é confiável — pode haver regra prometida que ninguém está checando.',
      resultadoObservado: integro
        ? contratados.length + '/' + contratados.length + ' presentes'
        : 'ausentes: ' + (ausentes.join(', ') || 'nenhum') + '; não declarados: ' + (naoContratados.join(', ') || 'nenhum') + '; duplicados: ' + (duplicados.join(', ') || 'nenhum'),
      acaoRecomendada: integro ? null : 'Reconciliar o catálogo com a lista de invariantes contratados.'
    }));
    gs.forEach(function (g) { if (g.encerrar) g.encerrar(); });
    gs.forEach(function (g) {
      var m = g.meta ? g.meta() : null;
      if (m) resultados.push(montar(m.def, quando, m.parcial));
    });
    return resultados.sort(function (a, b) { return NIVEL_ORDEM[a.nivel] - NIVEL_ORDEM[b.nivel]; });
  }

  function indexar(catalogo) {
    var porId = {}, duplicados = [];
    catalogo.forEach(function (def) { if (porId[def.id]) duplicados.push(def.id); else porId[def.id] = def; });
    return { porId: porId, duplicados: duplicados };
  }

  // ─── EXECUTORES ────────────────────────────────────────────────────────────
  // Ambos devolvem SEMPRE um resultado por invariante contratado + catalogo_integro
  // (+ meta-checks das guardas), em QUALQUER situação.
  // opts: { capacidades?: string[], guardas?: guarda[] }

  /** Para checks SÍNCRONOS (ex.: navegador, CLI). Check que devolve Promise → 🟠. */
  function verificarSync(ctx, catalogo, contratados, opts) {
    ctx = ctx || {};
    var quando = new Date().toISOString();
    var ix = indexar(catalogo), gs = guardasDe(opts), resultados = [];
    iniciarGuardas(gs);
    contratados.forEach(function (id) {
      var def = ix.porId[id];
      if (!def) { resultados.push(ausenteDoCatalogo(id, quando)); return; }
      var pre = naoPodeRodar(def, ctx, opts);
      if (pre) { resultados.push(montar(def, quando, pre)); return; }
      var estados = antesGuardas(gs, def, ctx), parcial;
      try {
        parcial = def.executar(ctx);
        if (parcial && typeof parcial.then === 'function') throw new Error('check assíncrono chamado por verificarSync — use verificar()');
      } catch (e) { resultados.push(montar(def, quando, excecao(def, e))); return; }
      resultados.push(montar(def, quando, depoisGuardas(gs, estados, def, parcial)));
    });
    return finalizar(catalogo, contratados, ix.porId, ix.duplicados, resultados, quando, gs);
  }

  /** Para checks que podem ser assíncronos (fetch, KV, banco). */
  function verificar(ctx, catalogo, contratados, opts) {
    ctx = ctx || {};
    var quando = new Date().toISOString();
    var ix = indexar(catalogo), gs = guardasDe(opts), resultados = [];
    iniciarGuardas(gs);
    var cadeia = Promise.resolve();
    contratados.forEach(function (id) {
      cadeia = cadeia.then(function () {
        var def = ix.porId[id];
        if (!def) { resultados.push(ausenteDoCatalogo(id, quando)); return; }
        var pre = naoPodeRodar(def, ctx, opts);
        if (pre) { resultados.push(montar(def, quando, pre)); return; }
        var estados = antesGuardas(gs, def, ctx);
        return Promise.resolve().then(function () { return def.executar(ctx); }).then(
          function (parcial) { resultados.push(montar(def, quando, depoisGuardas(gs, estados, def, parcial))); },
          function (e) { resultados.push(montar(def, quando, excecao(def, e))); }
        );
      });
    });
    return cadeia.then(function () { return finalizar(catalogo, contratados, ix.porId, ix.duplicados, resultados, quando, gs); });
  }

  function resumo(resultados, contratados) {
    var porNivel = {};
    ['violacao', 'divergente', 'nao_confirmado', 'confirmado'].forEach(function (n) {
      porNivel[n] = resultados.filter(function (r) { return r.nivel === n; }).length;
    });
    return { contratados: contratados.length, reportados: resultados.length, porNivel: porNivel };
  }

  // ─── GUARDA DE STORAGE (aprendida no Amigo Entregador) ─────────────────────
  // Para catálogos que rodam no aparelho do operador (dado real): um check não
  // pode escrever no que verifica. Duas camadas, porque nenhuma isolada basta:
  //  1. INTERCEPTOR troca localStorage por um proxy que registra e LANÇA.
  //  2. IMPRESSÃO DIGITAL: foto de local/sessionStorage antes/depois de CADA
  //     check; se mudou, o resultado dele é rebaixado a 🔴 — mesmo que ele tenha
  //     engolido a exceção do interceptor e declarado 🟢.
  // Limite dito em voz alta: IndexedDB, Cache API, cookies e rede não são
  // observáveis; "sem escrita" = nos canais observados, nunca "sem efeito colateral".
  var CANAIS_NAO_OBSERVADOS = 'IndexedDB, Cache API, cookies, rede';

  function impressaoDigital(ls) {
    try {
      if (!ls || typeof ls.length !== 'number' || typeof ls.key !== 'function') return null;
      var chaves = [];
      for (var i = 0; i < ls.length; i++) chaves.push(ls.key(i));
      chaves.sort();
      return chaves.map(function (k) { return k + '\u0001' + ls.getItem(k); }).join('\u0000');
    } catch (e) { return null; }
  }

  function guardaStorage(cfg) {
    cfg = cfg || {};
    var alvo = cfg.raiz || (typeof globalThis !== 'undefined' ? globalThis : {});
    var canais = cfg.canais || ['localStorage', 'sessionStorage'];
    var tentativas = [], escritas = [], original = null, instalado = false;

    function foto() {
      var partes = [], algum = false;
      canais.forEach(function (nome) {
        var d = null;
        try { d = impressaoDigital(alvo[nome]); } catch (e) { d = null; }
        if (d !== null) algum = true;
        partes.push(nome + '\u0002' + (d === null ? '(nao-observavel)' : d));
      });
      return algum ? partes.join('\u0003') : null;
    }
    function bloquear(op) {
      return function (k) {
        tentativas.push({ op: op, chave: k === undefined ? null : String(k) });
        throw new Error('GUARDIAO_ESCRITA_BLOQUEADA: ' + op + '(' + String(k) + ')');
      };
    }
    return {
      nome: 'storage',
      iniciar: function () {
        try {
          original = alvo.localStorage;
          if (!original) return;
          var proxy = {
            getItem: function (k) { return original.getItem(k); },
            key: function (i) { return original.key ? original.key(i) : null; },
            setItem: bloquear('setItem'), removeItem: bloquear('removeItem'), clear: bloquear('clear')
          };
          Object.defineProperty(proxy, 'length', { get: function () { return original.length; } });
          Object.defineProperty(alvo, 'localStorage', { value: proxy, configurable: true, writable: true });
          instalado = alvo.localStorage === proxy;
        } catch (e) { instalado = false; }
      },
      antes: function () { return { digital: foto(), n: tentativas.length }; },
      depois: function (def, est, parcial) {
        var d = foto();
        var mutou = est.digital !== null && d !== null && est.digital !== d;
        var tentou = tentativas.length > est.n;
        if (!mutou && !tentou) return null;
        var ops = tentativas.slice(est.n).map(function (t) { return t.op + '(' + t.chave + ')'; });
        escritas.push(def.id);
        return {
          nivel: 'violacao',
          titulo: 'Check tentou escrever em dado real: ' + def.id,
          explicacao: 'Este check tentou alterar o armazenamento do operador durante a verificação. O resultado que ele devolveu foi descartado — um verificador que escreve no que verifica não pode confirmar nada, mesmo que a escrita tenha sido bloqueada. Rebaixamento automático, não veredito do próprio check.',
          resultadoObservado: (tentou ? 'tentativa(s) bloqueada(s): ' + ops.join(', ') : 'impressão digital do ambiente mudou (' + canais.join('/') + ')') +
            ' — resultado original descartado (era: ' + String(parcial && parcial.nivel) + ')',
          acaoRecomendada: 'Marcar este check como exigindo ambiente isolado (exige: ["isolado"]), ou remover a escrita.'
        };
      },
      encerrar: function () {
        try { if (original) Object.defineProperty(alvo, 'localStorage', { value: original, configurable: true, writable: true }); } catch (e) { /* nada a fazer */ }
      },
      meta: function () {
        var ok = !escritas.length && !tentativas.length;
        return {
          def: {
            id: 'ambiente_sem_escrita', categoria: 'Ambiente',
            regra: 'nenhuma verificação pode alterar o armazenamento do operador; tentativa de escrita é bloqueada, registrada, e impede confirmação',
            entrada: 'interceptor de localStorage + impressão digital de ' + canais.join('/') + ' antes/depois de cada check',
            resultadoEsperado: 'nenhuma alteração dos storages observados durante a verificação',
            impacto: ['Dados reais do operador', 'Validade de qualquer 🟢 produzido no aparelho dele']
          },
          parcial: {
            nivel: ok ? 'confirmado' : 'violacao',
            titulo: ok ? 'Nenhuma verificação tocou no armazenamento real' : 'Verificação alterou o armazenamento real do operador',
            explicacao: ok
              ? 'A impressão digital de ' + canais.join(' e ') + ' foi comparada antes e depois de cada check e não mudou. ' +
                (instalado ? 'O interceptor esteve ativo, bloqueando qualquer escrita pelo caminho normal.' : 'O interceptor não pôde ser instalado neste runtime; a garantia vem só da impressão digital.') +
                ' LIMITE: o interceptor não impede código que capturou a referência do storage ANTES dele — nesse caminho a escrita acontece e é a impressão digital que acusa, depois do fato. E ' + CANAIS_NAO_OBSERVADOS + ' não são observados: afirma "sem escrita nos canais observados", nunca "sem efeito colateral nenhum".'
              : 'Os seguintes checks alteraram o armazenamento e tiveram o resultado rebaixado a violação: ' + escritas.join(', ') + '.',
            resultadoObservado: 'interceptor ' + (instalado ? 'ativo' : 'não instalável') + '; tentativas bloqueadas: ' + tentativas.length + '; checks que alteraram o storage: ' + (escritas.length ? escritas.join(', ') : 'nenhum'),
            acaoRecomendada: ok ? null : 'Marcar os checks listados como exigindo ambiente isolado.'
          }
        };
      }
    };
  }

  return {
    VERSAO: VERSAO,
    NIVEL_ORDEM: NIVEL_ORDEM, NIVEL_ICONE: NIVEL_ICONE, NIVEL_LABEL: NIVEL_LABEL,
    verificar: verificar, verificarSync: verificarSync,
    statusGeral: statusGeral, resumo: resumo,
    classificarPadrao: classificarPadrao, calcularRisco: calcularRisco,
    guardaStorage: guardaStorage
  };
});
