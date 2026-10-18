/**
 * leitor.js — Leitor de EPUB da Editora Três Trevo (área do cliente + Biblioteca TT)
 * Depende de epub.js 0.3.93 + JSZip (carregados pela página) e de /css/leitor.css.
 *
 * TTLeitor.abrir({
 *   titulo, autor,
 *   chave,                         // id estável pra lembrar a posição (localStorage)
 *   obterArquivo: async () => ({ epub?: url | ArrayBuffer, pdf?: url, erro?: msg }),
 *   trilha?:   async () => idDaMusica | null,   // mostra o botão de trilha
 *   sugestao?: async () => ({ titulo, autor, href, rotulo?, acao? }) | null,  // cartão na página final
 *   aoProgredir?: (pct) => void,   // ex.: salvar progresso no servidor
 *   aoFechar?: () => void,
 * })
 *
 * Decisões (ver diagnóstico 16/out):
 * - Rolagem vertical por capítulo (flow 'scrolled-doc') em vez de paginação em colunas:
 *   no celular a paginação cortava títulos largos pra fora da tela e não tinha gesto pra
 *   virar página. Rolar é o gesto nativo; os botões do rodapé trocam de capítulo.
 * - "Carregando…" só sai quando a 1ª página está desenhada (antes era apagado assim que a
 *   API respondia, e a tela ficava branca durante todo o download do EPUB).
 * - O % nunca fica preso em 0: usa a posição no sumário até as locations ficarem prontas.
 * - Estilo de leitura da editora aplicado por cima do CSS do EPUB (fonte, corpo, entrelinha,
 *   alinhamento à esquerda, sem hifenização, títulos que quebram linha).
 */
(function () {
  'use strict';

  const FONTES = 'https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=Fraunces:opsz,wght@9..144,500;9..144,600&display=swap';
  const TAMANHOS = [16, 17, 18, 19, 20, 22, 24];
  const TEMPO_LIMITE_MS = 30000;
  const TREVO_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><circle cx="12" cy="7.2" r="4.2"/><circle cx="7.3" cy="13.6" r="4.2"/><circle cx="16.7" cy="13.6" r="4.2"/></g><path d="M12 14.5c.4 3.4 1.6 5.9 3.8 7.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  const TREVO_DATA = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><g fill="#c8a84b"><circle cx="12" cy="7.2" r="4.2"/><circle cx="7.3" cy="13.6" r="4.2"/><circle cx="16.7" cy="13.6" r="4.2"/></g><path d="M12 14.5c.4 3.4 1.6 5.9 3.8 7.8" fill="none" stroke="#c8a84b" stroke-width="1.6" stroke-linecap="round"/></svg>');

  const TEMAS = {
    dia:   { fundo: '#fbf8f2', texto: '#2b241a', titulo: '#1e5c3a', faixa: '#1e5c3a', faixaTexto: '#f7f2e6', link: '#1e5c3a', suave: 'rgba(43,36,26,.55)' },
    noite: { fundo: '#0e1f15', texto: '#ece3cf', titulo: '#e8c96a', faixa: '#173f29', faixaTexto: '#f7f2e6', link: '#e8c96a', suave: 'rgba(236,227,207,.6)' },
  };

  let el = null;          // nós do DOM do leitor
  let book = null, rendition = null, opcoes = null;
  let ultimaLoc = null, timerLimite = null, sessao = 0;

  // ── Preferências do leitor (só conveniência local; falha silenciosa) ─────────
  function lerPrefs() {
    const padrao = { tamanho: window.matchMedia('(min-width: 900px)').matches ? 19 : 18, tema: 'dia' };
    try { return Object.assign(padrao, JSON.parse(localStorage.getItem('tt_leitor_prefs') || '{}')); }
    catch { return padrao; }
  }
  function salvarPrefs(p) { try { localStorage.setItem('tt_leitor_prefs', JSON.stringify(p)); } catch {} }
  function lerPosicao(chave) { try { return localStorage.getItem('tt_leitor_pos_' + chave); } catch { return null; } }
  function salvarPosicao(chave, cfi) { try { localStorage.setItem('tt_leitor_pos_' + chave, cfi); } catch {} }
  let prefs = lerPrefs();

  // Textos vêm do dicionário do idioma da página (scripts/i18n.mjs → window.T).
  const T = (k, v) => (window.T ? window.T(k, v) : k);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── DOM ──────────────────────────────────────────────────────────────────────
  function montar() {
    if (el) return;
    const raiz = document.createElement('div');
    raiz.id = 'tela-leitura';
    raiz.className = 'tl';
    raiz.setAttribute('role', 'dialog');
    raiz.setAttribute('aria-modal', 'true');
    raiz.innerHTML = `
      <div class="tl-progresso" aria-hidden="true"><span></span></div>
      <header class="tl-topo">
        <div class="tl-marca"><span class="tl-trevo">${TREVO_SVG}</span><span class="tl-marca-nome">${T('js.marca')}</span></div>
        <div class="tl-titulo"></div>
        <div class="tl-acoes">
          <button type="button" class="tl-btn tl-btn-trilha" hidden aria-label="${T('js.leitor.trilha')}" title="${T('js.leitor.trilha')}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M9 17.5a2.5 2.5 0 1 1-2.5-2.5c.36 0 .7.08 1 .21V6.6l11-2.2v11.1a2.5 2.5 0 1 1-2.5-2.5c.36 0 .7.08 1 .21V7.04l-8 1.6z"/></svg>
          </button>
          <button type="button" class="tl-btn tl-btn-ajustes" aria-label="${T('js.leitor.ajustes')}" aria-expanded="false" title="${T('js.leitor.ajustes.dica')}">Aa</button>
          <button type="button" class="tl-btn tl-btn-fechar" aria-label="${T('js.leitor.fechar.livro')}" title="${T('js.leitor.fechar')}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </header>
      <div class="tl-ajustes" hidden>
        <div class="tl-ajuste-linha">
          <span>${T('js.leitor.texto')}</span>
          <button type="button" class="tl-chip" data-acao="menor" aria-label="${T('js.leitor.menor')}">A−</button>
          <span class="tl-tamanho"></span>
          <button type="button" class="tl-chip" data-acao="maior" aria-label="${T('js.leitor.maior')}">A+</button>
        </div>
        <div class="tl-ajuste-linha">
          <span>${T('js.leitor.modo')}</span>
          <button type="button" class="tl-chip" data-tema="dia">${T('js.leitor.dia')}</button>
          <button type="button" class="tl-chip" data-tema="noite">${T('js.leitor.noite')}</button>
        </div>
      </div>
      <main class="tl-viewer"></main>
      <div class="tl-estado" role="status"></div>
      <footer class="tl-base">
        <button type="button" class="tl-nav tl-ant" aria-label="${T('js.leitor.cap.anterior')}"><span aria-hidden="true">‹</span><span class="tl-nav-txt">${T('js.leitor.anterior')}</span></button>
        <div class="tl-local"><span class="tl-cap"></span><span class="tl-pct">—</span></div>
        <button type="button" class="tl-nav tl-prox" aria-label="${T('js.leitor.cap.proximo')}"><span class="tl-nav-txt">${T('js.leitor.proximo')}</span><span aria-hidden="true">›</span></button>
      </footer>
      <section class="tl-fim" hidden></section>`;
    document.body.appendChild(raiz);

    el = {
      raiz,
      barra: raiz.querySelector('.tl-progresso span'),
      titulo: raiz.querySelector('.tl-titulo'),
      viewer: raiz.querySelector('.tl-viewer'),
      estado: raiz.querySelector('.tl-estado'),
      ajustes: raiz.querySelector('.tl-ajustes'),
      btnAjustes: raiz.querySelector('.tl-btn-ajustes'),
      btnTrilha: raiz.querySelector('.tl-btn-trilha'),
      tamanho: raiz.querySelector('.tl-tamanho'),
      cap: raiz.querySelector('.tl-cap'),
      pct: raiz.querySelector('.tl-pct'),
      ant: raiz.querySelector('.tl-ant'),
      prox: raiz.querySelector('.tl-prox'),
      proxTxt: raiz.querySelector('.tl-prox .tl-nav-txt'),
      base: raiz.querySelector('.tl-base'),
      fim: raiz.querySelector('.tl-fim'),
    };

    raiz.querySelector('.tl-btn-fechar').onclick = fechar;
    el.btnAjustes.onclick = () => {
      const abrir = el.ajustes.hidden;
      el.ajustes.hidden = !abrir;
      el.btnAjustes.setAttribute('aria-expanded', String(abrir));
    };
    el.ajustes.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const i = TAMANHOS.indexOf(prefs.tamanho);
      if (b.dataset.acao === 'menor' && i > 0) prefs.tamanho = TAMANHOS[i - 1];
      if (b.dataset.acao === 'maior' && i < TAMANHOS.length - 1) prefs.tamanho = TAMANHOS[i + 1];
      if (b.dataset.tema) prefs.tema = b.dataset.tema;
      salvarPrefs(prefs);
      aplicarPrefs();
    });
    el.ant.onclick = () => irCapitulo(-1);
    el.prox.onclick = () => irCapitulo(1);
    document.addEventListener('keydown', teclado);
  }

  function teclado(e) {
    if (!el || el.raiz.hidden || !el.raiz.classList.contains('aberto')) return;
    if (e.key === 'Escape') { if (!el.ajustes.hidden) el.btnAjustes.click(); else fechar(); }
    if (e.key === 'ArrowRight' && !e.altKey) irCapitulo(1);
    if (e.key === 'ArrowLeft' && !e.altKey) irCapitulo(-1);
  }

  // ── Estilo aplicado dentro do EPUB ───────────────────────────────────────────
  function cssLeitura() {
    const t = TEMAS[prefs.tema] || TEMAS.dia;
    return `
      html { background:${t.fundo} !important; -webkit-text-size-adjust:100%; }
      body {
        background:${t.fundo} !important; color:${t.texto} !important;
        font-family:'Literata', Georgia, 'Times New Roman', serif !important;
        font-size:${prefs.tamanho}px !important; line-height:1.7 !important;
        text-align:left !important; hyphens:none !important; -webkit-hyphens:none !important;
        overflow-wrap:break-word !important; word-break:normal !important;
        max-width:36em !important; margin:0 auto !important; padding:28px 20px 56px !important;
        box-sizing:border-box !important; overflow-x:hidden !important;
      }
      body * { max-width:100% !important; box-sizing:border-box; }
      p, li, blockquote, dd, div {
        font-size:1em !important; line-height:1.7 !important; text-align:left !important;
        hyphens:none !important; -webkit-hyphens:none !important; color:inherit !important;
        font-family:inherit !important;
      }
      p { margin:0 0 1em !important; text-indent:0 !important; }
      h1, h2, h3, h4, h5, h6 {
        font-family:'Fraunces', Georgia, serif !important; color:${t.titulo} !important;
        line-height:1.2 !important; letter-spacing:normal !important; text-align:left !important;
        overflow-wrap:break-word !important; hyphens:none !important; white-space:normal !important;
        margin:1.6em 0 .7em !important; font-weight:600 !important;
      }
      h1 { font-size:1.55em !important; } h2 { font-size:1.3em !important; } h3 { font-size:1.12em !important; }
      h4, h5, h6 { font-size:1em !important; }
      .tt-abertura {
        background:${t.faixa} !important; color:${t.faixaTexto} !important;
        margin:-28px -20px 1.4em !important; padding:44px 20px 26px !important; max-width:none !important;
        font-size:1.5em !important; position:relative;
      }
.tt-abertura-solta { margin-top:1.2em !important; }
      .tt-abertura::before {
        content:''; display:block; width:26px; height:26px; margin-bottom:14px;
        background:url("${TREVO_DATA}") no-repeat center / contain;
      }
      hr { border:0 !important; height:26px !important; margin:1.8em auto !important;
           background:url("${TREVO_DATA}") no-repeat center / 20px 20px !important; opacity:.85; }
      a { color:${t.link} !important; }
      img, svg, video { max-width:100% !important; height:auto !important; }
      pre { white-space:pre-wrap !important; font-size:.9em !important; }
      table { width:100% !important; table-layout:fixed; }
      blockquote { margin:1em 0 !important; padding-left:1em !important; border-left:2px solid ${t.titulo} !important; }
      ::selection { background:rgba(200,168,75,.35); }`;
  }

  function prepararConteudo(contents) {
    const doc = contents.document;
    if (!doc || !doc.head) return;
    contents.addStylesheet(FONTES).catch?.(() => {});
    const style = doc.createElement('style');
    style.id = 'tt-leitura';
    style.textContent = cssLeitura();
    doc.head.appendChild(style);

    // Primeiro título do capítulo vira a faixa de abertura da editora.
    const primeiro = doc.body && doc.body.querySelector('h1, h2');
    if (primeiro) {
      primeiro.classList.add('tt-abertura');
      // Com texto antes do título (ex.: "Amostra gratuita"), a faixa não sobe até o topo.
      const antes = doc.createRange();
      antes.setStart(doc.body, 0);
      antes.setEndBefore(primeiro);
      if (antes.toString().trim()) primeiro.classList.add('tt-abertura-solta');
    }

    // Valores e números não se partem no fim da linha ("R$ / 100" → "R$ 100").
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const v = n.nodeValue;
      if (/(R\$|N[ºo°]|§)\s+\d/.test(v)) n.nodeValue = v.replace(/(R\$|N[ºo°]|§)\s+(?=\d)/g, '$1 ');
    }
    doc.addEventListener('keydown', teclado);
  }

  function aplicarPrefs() {
    if (!el) return;
    el.raiz.dataset.tema = prefs.tema;
    el.tamanho.textContent = prefs.tamanho + 'px';
    el.ajustes.querySelectorAll('[data-tema]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tema === prefs.tema)));
    if (rendition) {
      rendition.getContents().forEach((c) => {
        const s = c.document && c.document.getElementById('tt-leitura');
        if (s) s.textContent = cssLeitura();
      });
    }
  }

  // ── Estados (carregando / erro) ──────────────────────────────────────────────
  function mostrarEstado(html) {
    el.estado.innerHTML = html;
    el.estado.hidden = !html;
  }
  function carregando(msg) {
    mostrarEstado(`<div class="tl-estado-box"><div class="tl-spinner"></div><p>${esc(msg)}</p></div>`);
  }
  function erro(msg, pdf) {
    clearTimeout(timerLimite);
    mostrarEstado(`<div class="tl-estado-box">
      <p class="tl-estado-titulo">${T('js.leitor.erro.titulo')}</p>
      <p>${esc(msg)}</p>
      <div class="tl-estado-acoes">
        <button type="button" class="tl-cta" data-acao="tentar">${T('js.leitor.tentar')}</button>
        ${pdf ? `<a class="tl-cta tl-cta-sec" href="${esc(pdf)}" target="_blank" rel="noopener">${T('js.leitor.abrir.pdf')}</a>` : ''}
      </div>
      <p class="tl-estado-ajuda">${T('js.leitor.erro.ajuda')}</p>
    </div>`);
    const t = el.estado.querySelector('[data-acao="tentar"]');
    if (t) t.onclick = () => abrir(opcoes);
  }

  // ── Navegação e progresso ────────────────────────────────────────────────────
  function indiceAtual() { return ultimaLoc ? ultimaLoc.start.index : 0; }
  function ultimoIndice() { const l = book && book.spine.last(); return l ? l.index : 0; }

  function irCapitulo(dir) {
    if (!rendition || !ultimaLoc) return;
    if (dir > 0 && indiceAtual() >= ultimoIndice()) { mostrarFim(); return; }
    if (dir < 0 && !el.fim.hidden) { el.fim.hidden = true; return; }
    const alvo = book.spine.get(indiceAtual() + dir);
    if (!alvo) return;
    rendition.display(alvo.href).then(() => { el.viewer.querySelector('.epub-container')?.scrollTo(0, 0); });
  }

  function nomeCapitulo(href) {
    const toc = (book && book.navigation && book.navigation.toc) || [];
    const base = (href || '').split('#')[0];
    const achar = (itens) => {
      for (const i of itens) {
        const h = (i.href || '').split('#')[0];
        if (h && (h.endsWith(base) || base.endsWith(h))) return (i.label || '').trim();
        const sub = i.subitems && i.subitems.length ? achar(i.subitems) : null;
        if (sub) return sub;
      }
      return null;
    };
    return base ? achar(toc) : null;
  }

  function atualizarProgresso() {
    if (!ultimaLoc || !book) return;
    const total = ultimoIndice() + 1;
    let pct;
    if (book.locations.length()) pct = book.locations.percentageFromCfi(ultimaLoc.start.cfi) * 100;
    else pct = (indiceAtual() / Math.max(total, 1)) * 100;
    pct = Math.max(0, Math.min(100, pct));
    el.barra.style.width = pct.toFixed(1) + '%';
    el.pct.textContent = Math.round(pct) + '%';
    el.cap.textContent = nomeCapitulo(ultimaLoc.start.href) || '';
    el.ant.disabled = indiceAtual() <= 0;
    el.proxTxt.textContent = indiceAtual() >= ultimoIndice() ? T('js.leitor.concluir') : T('js.leitor.proximo');
    if (opcoes.aoProgredir) opcoes.aoProgredir(pct);
  }

  // ── Página final: colofão + próximo passo, sem pressão de compra ─────────────
  async function mostrarFim() {
    el.fim.innerHTML = `<div class="tl-fim-box">
      <span class="tl-fim-trevo">${TREVO_SVG}</span>
      <p class="tl-fim-sobre">${T('js.leitor.fim.sobre')}</p>
      <h2 class="tl-fim-titulo">${esc(opcoes.titulo)}</h2>
      ${opcoes.autor ? `<p class="tl-fim-autor">${esc(opcoes.autor)}</p>` : ''}
      <div class="tl-fim-sugestao" hidden></div>
      <div class="tl-fim-acoes">
        <button type="button" class="tl-cta" data-acao="biblioteca">${T('js.leitor.fim.voltar')}</button>
        <button type="button" class="tl-cta tl-cta-sec" data-acao="inicio">${T('js.leitor.fim.reler')}</button>
      </div>
      <p class="tl-colofao">${T('js.leitor.colofao')}</p>
    </div>`;
    el.fim.hidden = false;
    el.barra.style.width = '100%';
    el.pct.textContent = '100%';
    if (opcoes.aoProgredir) opcoes.aoProgredir(100);
    el.fim.querySelector('[data-acao="biblioteca"]').onclick = fechar;
    el.fim.querySelector('[data-acao="inicio"]').onclick = () => {
      el.fim.hidden = true;
      rendition.display(primeiroConteudo());
    };
    if (opcoes.sugestao) {
      try {
        const s = await opcoes.sugestao();
        const box = el.fim.querySelector('.tl-fim-sugestao');
        if (s && box) {
          box.innerHTML = `<p class="tl-fim-rotulo">${esc(s.rotulo || T('js.leitor.fim.mesmo.autor'))}</p>
            <a class="tl-fim-card" href="${esc(s.href)}"><span class="tl-fim-card-titulo">${esc(s.titulo)}</span>
            ${s.autor ? `<span class="tl-fim-card-autor">${esc(s.autor)}</span>` : ''}<span class="tl-fim-card-link">${esc(s.acao || T('js.leitor.fim.conhecer'))} ›</span></a>`;
          box.hidden = false;
        }
      } catch { /* sugestão é opcional */ }
    }
  }

  // Sumário (nav.xhtml) e capa costumam ser os primeiros itens do spine.
  function primeiroConteudo() {
    try {
      const manifest = (book.packaging && book.packaging.manifest) || {};
      const navHref = (Object.values(manifest).find((m) => (m.properties || '').includes('nav')) || {}).href;
      const item = book.spine.spineItems.find((i) => i.linear !== 'no' && i.href !== navHref && !/cover|capa/i.test(i.href));
      return item ? item.href : undefined;
    } catch { return undefined; }
  }

  // ── Abrir / fechar ───────────────────────────────────────────────────────────
  async function abrir(op) {
    montar();
    limpar();
    const minhaSessao = ++sessao;
    opcoes = op;
    prefs = lerPrefs();
    aplicarPrefs();
    el.titulo.textContent = op.titulo || '';
    el.cap.textContent = '';
    el.pct.textContent = '—';
    el.barra.style.width = '0%';
    el.fim.hidden = true;
    el.ajustes.hidden = true;
    el.base.hidden = false;
    el.btnTrilha.hidden = true;
    el.raiz.classList.add('aberto');
    document.documentElement.classList.add('tl-travado');
    carregando(T('js.leitor.abrindo'));

    if (op.trilha) {
      Promise.resolve(op.trilha()).then((id) => {
        if (!id || minhaSessao !== sessao) return;
        el.btnTrilha.hidden = false;
        el.btnTrilha.onclick = () => window.TTPlayer && window.TTPlayer.play(id);
      }).catch(() => {});
    }

    let arq;
    try { arq = await op.obterArquivo(); }
    catch { arq = { erro: T('js.erro.conexao') }; }
    if (minhaSessao !== sessao) return;
    if (!arq || arq.erro || (!arq.epub && !arq.pdf)) { erro((arq && arq.erro) || T('js.leitor.sem.formato')); return; }

    if (!arq.epub) {
      // PDF: celulares não exibem PDF embutido — abre no visualizador do aparelho.
      el.base.hidden = true;
      if (window.matchMedia('(pointer: coarse)').matches) {
        mostrarEstado(`<div class="tl-estado-box"><p class="tl-estado-titulo">${esc(op.titulo)}</p>
          <p>${T('js.leitor.pdf.celular')}</p>
          <div class="tl-estado-acoes"><a class="tl-cta" href="${esc(arq.pdf)}" target="_blank" rel="noopener">${T('js.leitor.abrir.pdf')}</a></div></div>`);
      } else {
        mostrarEstado('');
        el.viewer.innerHTML = `<iframe class="tl-pdf" src="${esc(arq.pdf)}" title="${esc(op.titulo)}"></iframe>`;
      }
      return;
    }

    timerLimite = setTimeout(() => {
      if (minhaSessao === sessao) erro(T('js.leitor.lento'), arq.pdf);
    }, TEMPO_LIMITE_MS);

    try {
      // URL → 'epub' (o epub.js baixa); bytes já baixados (ArrayBuffer) → 'binary'.
      book = window.ePub(arq.epub, { openAs: arq.epub instanceof ArrayBuffer ? 'binary' : 'epub' });
      rendition = book.renderTo(el.viewer, { width: '100%', height: '100%', flow: 'scrolled-doc', allowScriptedContent: false });
      rendition.hooks.content.register(prepararConteudo);
      rendition.on('relocated', (loc) => {
        ultimaLoc = loc;
        if (op.chave) salvarPosicao(op.chave, loc.start.cfi);
        atualizarProgresso();
      });
      await book.ready;
      if (minhaSessao !== sessao) return;
      const salvo = op.chave ? lerPosicao(op.chave) : null;
      try { await rendition.display(salvo || primeiroConteudo()); }
      catch { await rendition.display(primeiroConteudo()); }
      if (minhaSessao !== sessao) return;
      clearTimeout(timerLimite);
      mostrarEstado('');
      // % exato: gera as locations em segundo plano, sem travar a abertura.
      book.locations.generate(1600).then(() => { if (minhaSessao === sessao) atualizarProgresso(); }).catch(() => {});
    } catch (e) {
      if (minhaSessao === sessao) erro(T('js.leitor.ilegivel'), arq.pdf);
    }
  }

  function limpar() {
    clearTimeout(timerLimite);
    if (rendition) { try { rendition.destroy(); } catch {} rendition = null; }
    if (book) { try { book.destroy(); } catch {} book = null; }
    ultimaLoc = null;
    if (el) el.viewer.innerHTML = '';
  }

  function fechar() {
    sessao++;
    limpar();
    if (!el) return;
    el.raiz.classList.remove('aberto');
    document.documentElement.classList.remove('tl-travado');
    mostrarEstado('');
    const cb = opcoes && opcoes.aoFechar;
    opcoes = null;
    if (cb) cb();
  }

  window.TTLeitor = { abrir, fechar };
})();
