/**
 * leitor-tt.js — Leitor imersivo da Editora Três Trevo (um só, para a área do cliente
 * e para a Biblioteca Clássica). EPUB via epub.js; PDF pelo visualizador do navegador.
 *
 * Inclua DEPOIS de jszip e epub.js:
 *   <script src="/js/leitor-tt.js"></script>
 * API global:
 *   TTLeitor.abrir({
 *     titulo,                       // texto do cabeçalho (aparece só no menu)
 *     chave,                        // id estável do livro: guarda onde o leitor parou
 *     obterArquivo: async () => ({ url, formato: 'epub' | 'pdf' }),
 *     aoProgresso: (pct) => {},     // opcional, já com intervalo mínimo entre chamadas
 *     trilha: { rotulo, tocar },    // opcional: botão "ouvir trilha" no menu
 *     aoFechar: () => {},           // opcional
 *   })
 *   TTLeitor.definirTrilha({ rotulo, tocar })   // quando a trilha chega depois
 *   TTLeitor.fechar()
 *
 * Por que existe (tela branca relatada no celular): o leitor antigo apagava o
 * "Carregando…" assim que o livro começava a baixar e não tratava nenhum erro do
 * epub.js — download lento, link expirado ou EPUB com problema deixavam a tela
 * branca para sempre. Aqui o aviso fica até a primeira página aparecer, e qualquer
 * falha (ou 30 s sem página) vira mensagem com "tentar de novo" e "baixar".
 *
 * Navegação sem botões fixos (padrão Kindle): toque na lateral esquerda/direita vira
 * a página (a seta aparece suave e some), toque no meio mostra o menu, deslizar
 * também vira. Teclado, roda do mouse e o botão "voltar" do Android funcionam.
 */
(function () {
  'use strict';

  const TEMPO_LIMITE_MS = 30000;
  const CSS = `
.ttl{position:fixed;inset:0;z-index:3000;background:#f8f3e8;display:none;color:#2b2418;
  font-family:'Poppins',system-ui,sans-serif;-webkit-tap-highlight-color:transparent;touch-action:pan-y}
.ttl.aberto{display:block}
.ttl-livro{position:absolute;top:0;bottom:6px;left:50%;transform:translateX(-50%);
  width:min(100%,780px);padding:max(18px,env(safe-area-inset-top)) 0 18px}
.ttl-livro iframe{border:none}
.ttl-livro.pdf{width:100%;padding:0}
.ttl-livro.pdf iframe{width:100%;height:100%}
.ttl-estado{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:14px;padding:32px;text-align:center;background:#f8f3e8;z-index:4}
.ttl-estado[hidden]{display:none}
.ttl-estado h2{font-family:'Lora',Georgia,serif;font-weight:400;font-size:21px;color:#2b2418;max-width:28ch}
.ttl-estado p{font-size:14px;line-height:1.6;color:rgba(43,36,24,.62);max-width:36ch}
.ttl-giro{width:30px;height:30px;border-radius:50%;border:2.5px solid rgba(43,36,24,.12);border-top-color:#c8a84b;
  animation:ttl-giro .8s linear infinite}
@keyframes ttl-giro{to{transform:rotate(360deg)}}
.ttl-acoes{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:6px}
.ttl-btn{font:500 14px 'Poppins',system-ui,sans-serif;padding:11px 20px;border-radius:3px;cursor:pointer;
  border:1px solid rgba(43,36,24,.2);background:transparent;color:#2b2418;text-decoration:none}
.ttl-btn.forte{background:#1a4a2e;border-color:#1a4a2e;color:#fff}
.ttl-zona{position:absolute;top:0;bottom:6px;z-index:2;background:transparent;border:none;padding:0;margin:0;cursor:pointer;
  display:flex;align-items:center;outline:none}
.ttl-zona:focus-visible{box-shadow:inset 0 0 0 2px rgba(200,168,75,.6)}
.ttl-zona-ant{left:0;width:28%;justify-content:flex-start;padding-left:10px}
.ttl-zona-meio{left:28%;width:44%}
.ttl-zona-prox{right:0;width:28%;justify-content:flex-end;padding-right:10px}
.ttl-seta{width:44px;height:44px;border-radius:50%;background:rgba(15,45,26,.55);color:#fff;font-size:26px;line-height:42px;
  text-align:center;opacity:0;transform:scale(.85);transition:opacity .35s ease,transform .35s ease;pointer-events:none}
.ttl-zona.mostra .ttl-seta{opacity:1;transform:scale(1);transition-duration:.12s}
.ttl-menu{position:absolute;top:0;left:0;right:0;z-index:5;display:flex;align-items:center;gap:10px;
  padding:max(10px,env(safe-area-inset-top)) 14px 10px;background:rgba(248,243,232,.97);
  box-shadow:0 1px 0 rgba(43,36,24,.1),0 6px 20px rgba(43,36,24,.08);
  transform:translateY(-105%);transition:transform .25s ease}
.ttl.menu .ttl-menu{transform:none}
.ttl-menu-titulo{flex:1;min-width:0;font-family:'Lora',Georgia,serif;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ttl-menu .ttl-btn{padding:8px 12px;font-size:13px}
.ttl-dica{position:absolute;left:50%;bottom:28px;transform:translateX(-50%);z-index:5;background:rgba(15,45,26,.88);color:#fff;
  font-size:13px;padding:10px 16px;border-radius:20px;white-space:nowrap;opacity:0;transition:opacity .4s;pointer-events:none}
.ttl-dica.ve{opacity:1}
.ttl-progresso{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(43,36,24,.08);z-index:3}
.ttl-progresso-fill{height:100%;width:0;background:linear-gradient(90deg,#8a6f28,#c8a84b);transition:width .4s ease}
@media (prefers-reduced-motion:reduce){.ttl-seta,.ttl-menu,.ttl-progresso-fill,.ttl-dica{transition:none}.ttl-giro{animation-duration:2s}}
`;

  let raiz = null, el = {};
  let book = null, rendition = null, sessao = 0;
  let opcoes = null, arquivo = null, virando = false, timerMenu = null, timerProgresso = null, ultimoPct = -1;

  function montar() {
    if (raiz) return;
    const estilo = document.createElement('style');
    estilo.textContent = CSS;
    document.head.appendChild(estilo);
    raiz = document.createElement('div');
    raiz.className = 'ttl';
    raiz.setAttribute('role', 'dialog');
    raiz.setAttribute('aria-modal', 'true');
    raiz.innerHTML = `
      <div class="ttl-livro" id="ttl-livro"></div>
      <button class="ttl-zona ttl-zona-ant" type="button" aria-label="Página anterior"><span class="ttl-seta" aria-hidden="true">‹</span></button>
      <button class="ttl-zona ttl-zona-meio" type="button" aria-label="Mostrar menu"></button>
      <button class="ttl-zona ttl-zona-prox" type="button" aria-label="Próxima página"><span class="ttl-seta" aria-hidden="true">›</span></button>
      <div class="ttl-menu">
        <button class="ttl-btn" type="button" data-ttl="fechar" aria-label="Fechar o livro">← Voltar</button>
        <div class="ttl-menu-titulo"></div>
        <button class="ttl-btn" type="button" data-ttl="trilha" hidden>🎵 Trilha</button>
      </div>
      <div class="ttl-progresso" role="progressbar" aria-label="Progresso da leitura" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="ttl-progresso-fill"></div></div>
      <div class="ttl-dica">Toque nas laterais para virar a página · no meio para o menu</div>
      <div class="ttl-estado"></div>`;
    document.body.appendChild(raiz);
    el = {
      livro: raiz.querySelector('.ttl-livro'), estado: raiz.querySelector('.ttl-estado'),
      ant: raiz.querySelector('.ttl-zona-ant'), meio: raiz.querySelector('.ttl-zona-meio'), prox: raiz.querySelector('.ttl-zona-prox'),
      titulo: raiz.querySelector('.ttl-menu-titulo'), trilha: raiz.querySelector('[data-ttl="trilha"]'),
      barra: raiz.querySelector('.ttl-progresso'), fill: raiz.querySelector('.ttl-progresso-fill'), dica: raiz.querySelector('.ttl-dica'),
    };
    el.ant.addEventListener('click', () => virar(-1, el.ant));
    el.prox.addEventListener('click', () => virar(1, el.prox));
    el.meio.addEventListener('click', () => alternarMenu());
    raiz.querySelector('[data-ttl="fechar"]').addEventListener('click', () => fechar());
    el.trilha.addEventListener('click', () => opcoes?.trilha?.tocar?.());
    el.estado.addEventListener('click', (e) => {
      const acao = e.target.closest('[data-ttl]')?.dataset.ttl;
      if (acao === 'fechar') fechar();
      if (acao === 'tentar') carregar();
    });
    // Deslizar vira a página (o toque simples já é tratado pelo clique nas zonas).
    let x0 = null, y0 = null;
    raiz.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    raiz.addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { e.preventDefault(); virar(dx < 0 ? 1 : -1, dx < 0 ? el.prox : el.ant); }
    });
    raiz.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > 4) virar(e.deltaY > 0 ? 1 : -1); }, { passive: true });
    window.addEventListener('popstate', () => { if (raiz.classList.contains('aberto')) fechar(true); });
  }

  function teclas(e) {
    if (!raiz?.classList.contains('aberto')) return;
    if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); virar(1, el.prox); }
    else if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); virar(-1, el.ant); }
    else if (e.key === 'Escape') fechar();
  }

  function estado(tipo, titulo = '', texto = '') {
    if (!tipo) { el.estado.hidden = true; el.estado.innerHTML = ''; return; }
    el.estado.hidden = false;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    if (tipo === 'carregando') {
      el.estado.innerHTML = `<div class="ttl-giro" role="status" aria-label="Carregando"></div><p>${esc(texto || 'Abrindo o livro…')}</p>`;
      return;
    }
    const baixar = arquivo?.url ? `<a class="ttl-btn" href="${esc(arquivo.url)}" target="_blank" rel="noopener">Baixar o arquivo</a>` : '';
    el.estado.innerHTML = `<h2>${esc(titulo)}</h2><p>${esc(texto)}</p>
      <div class="ttl-acoes"><button class="ttl-btn forte" type="button" data-ttl="tentar">Tentar de novo</button>${baixar}
      <button class="ttl-btn" type="button" data-ttl="fechar">Voltar</button></div>`;
  }

  function mostrarSeta(zona) {
    if (!zona) return;
    zona.classList.add('mostra');
    clearTimeout(zona._t);
    zona._t = setTimeout(() => zona.classList.remove('mostra'), 450);
  }

  // Trava enquanto a virada anterior não termina: tecla segurada ou toques seguidos
  // empilhavam next()/prev() no epub.js e o progresso "congelava".
  function virar(dir, zona) {
    if (!rendition || virando || !el.estado.hidden) return;
    mostrarSeta(zona);
    raiz.classList.remove('menu');
    virando = true;
    Promise.resolve(dir > 0 ? rendition.next() : rendition.prev()).catch(() => {}).finally(() => { virando = false; });
  }

  function alternarMenu(forcar) {
    const abrir = forcar ?? !raiz.classList.contains('menu');
    raiz.classList.toggle('menu', abrir);
    clearTimeout(timerMenu);
    if (abrir) timerMenu = setTimeout(() => raiz.classList.remove('menu'), 4000);
  }

  function guardar(chave, valor) { try { localStorage.setItem(chave, valor); } catch { /* modo privado */ } }
  function ler(chave) { try { return localStorage.getItem(chave); } catch { return null; } }

  function progresso(pct) {
    const p = Math.max(0, Math.min(100, pct));
    el.fill.style.width = p + '%';
    el.barra.setAttribute('aria-valuenow', String(Math.round(p)));
    if (!opcoes?.aoProgresso || Math.round(p) === ultimoPct) return;
    ultimoPct = Math.round(p);
    clearTimeout(timerProgresso);
    timerProgresso = setTimeout(() => { try { opcoes.aoProgresso(ultimoPct); } catch { /* não derruba a leitura */ } }, 1500);
  }

  function destruir() {
    sessao++;
    try { rendition?.destroy(); } catch { /* já destruído */ }
    try { book?.destroy(); } catch { /* já destruído */ }
    rendition = null; book = null; virando = false;
    el.livro.innerHTML = '';
    el.livro.classList.remove('pdf');
  }

  // Primeiro item de texto de verdade: pula sumário (nav) e capa, comuns no início do spine.
  function primeiroConteudo(b) {
    try {
      const manifest = b.packaging?.manifest || {};
      const navHref = Object.values(manifest).find((m) => (m.properties || '').includes('nav'))?.href;
      return b.spine.items.find((i) => i.linear !== 'no' && i.href !== navHref && !/cover|capa|titlepage/i.test(i.href))?.href;
    } catch { return undefined; }
  }

  async function baixar(url, aoAvancar) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status === 403 || r.status === 401 ? 'link_vencido' : `http_${r.status}`);
    const total = Number(r.headers.get('Content-Length')) || 0;
    if (!r.body || !total) return r.arrayBuffer();
    const leitor = r.body.getReader(), partes = [];
    let recebido = 0, ultimo = -1;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      partes.push(value);
      recebido += value.length;
      const pct = Math.min(99, Math.floor((recebido / total) * 100));
      if (pct >= ultimo + 5) { ultimo = pct; aoAvancar(pct); }
    }
    const tudo = new Uint8Array(recebido);
    let pos = 0;
    for (const parte of partes) { tudo.set(parte, pos); pos += parte.length; }
    return tudo.buffer;
  }

  async function carregar() {
    destruir();
    const minha = sessao;
    estado('carregando');
    progresso(0);
    try {
      arquivo = await opcoes.obterArquivo();
      if (minha !== sessao) return;
      if (!arquivo?.url) throw new Error('sem_arquivo');
    } catch (err) {
      if (minha === sessao) estado('erro', 'Não foi possível abrir o livro', err?.message && err.message !== 'sem_arquivo' ? err.message : 'O arquivo deste livro não respondeu. Verifique a conexão e tente de novo.');
      return;
    }

    if (arquivo.formato === 'pdf') {
      // Celular não mostra PDF dentro da página (tela branca): lá, o PDF abre no visualizador do aparelho.
      const toque = window.matchMedia('(pointer: coarse)').matches;
      if (toque) { estado('erro', 'Este título está em PDF', 'No celular, o PDF abre no leitor do próprio aparelho.'); return; }
      el.livro.classList.add('pdf');
      el.livro.innerHTML = `<iframe title="${String(opcoes.titulo || 'Livro').replace(/"/g, '&quot;')}" src="${arquivo.url}"></iframe>`;
      estado(null);
      return;
    }

    const limite = setTimeout(() => {
      if (minha === sessao && !el.estado.hidden) estado('erro', 'O livro está demorando para abrir', 'A conexão parece lenta. Tente de novo ou baixe o arquivo para ler no aparelho.');
    }, TEMPO_LIMITE_MS);
    try {
      // Baixa aqui (e não pelo epub.js): erro HTTP vira mensagem na hora — o epub.js
      // ficava preso sem rejeitar — e o leitor vê o percentual no 4G.
      const dados = await baixar(arquivo.url, (pct) => { if (minha === sessao) estado('carregando', '', `Baixando o livro… ${pct}%`); });
      if (minha !== sessao) return;
      book = window.ePub(dados);
      const largura = el.livro.clientWidth;
      rendition = book.renderTo(el.livro, { width: '100%', height: '100%', spread: 'none', flow: 'paginated',
        gap: Math.round(Math.max(36, Math.min(96, largura * 0.12))) });
      rendition.themes.default({
        body: { 'font-family': "'Lora', Georgia, 'Times New Roman', serif !important", color: '#2b2418 !important',
          background: '#f8f3e8 !important', 'line-height': '1.7 !important' },
        'p, li': { 'font-size': '1.06em', 'text-align': 'left', hyphens: 'auto' },
        'h1, h2, h3': { 'font-weight': '500', 'line-height': '1.25' },
        img: { 'max-width': '100% !important', height: 'auto !important' },
      });
      rendition.on('relocated', (loc) => {
        if (minha !== sessao) return;
        if (!el.estado.hidden) estado(null);
        guardar(`ttl:pos:${opcoes.chave}`, loc.start.cfi);
        const pctLocal = book.locations.length() ? book.locations.percentageFromCfi(loc.start.cfi) * 100
          : (loc.start.index / Math.max(1, book.spine.length)) * 100;
        progresso(pctLocal);
      });
      await book.ready;
      if (minha !== sessao) return;
      const salvo = ler(`ttl:pos:${opcoes.chave}`);
      await rendition.display(salvo || primeiroConteudo(book)).catch(() => rendition.display());
      if (minha !== sessao) return;
      estado(null);
      setTimeout(() => { if (minha === sessao) alternarMenu(false); }, 1500);
      book.locations.generate(1600).then(() => {
        const loc = rendition?.currentLocation?.();
        if (minha === sessao && loc?.start) progresso(book.locations.percentageFromCfi(loc.start.cfi) * 100);
      }).catch(() => {});
      if (!ler('ttl:dica')) {
        guardar('ttl:dica', '1');
        el.dica.classList.add('ve');
        setTimeout(() => el.dica.classList.remove('ve'), 3500);
      }
    } catch (err) {
      console.error('[leitor] falha ao abrir', err);
      if (minha !== sessao) return;
      const msg = err?.message === 'link_vencido' ? 'O link de leitura venceu. Toque em "tentar de novo" para gerar outro.'
        : /^http_|Failed to fetch|NetworkError|Load failed/.test(err?.message || '') ? 'O arquivo não respondeu. Verifique a conexão e tente de novo.'
        : 'O arquivo chegou com problema. Tente de novo; se continuar, baixe o arquivo.';
      estado('erro', 'Não foi possível abrir o livro', msg);
    } finally {
      clearTimeout(limite);
    }
  }

  function abrir(o) {
    montar();
    opcoes = o;
    arquivo = null;
    ultimoPct = -1;
    raiz.setAttribute('aria-label', o.titulo || 'Leitor');
    el.titulo.textContent = o.titulo || '';
    el.trilha.hidden = !o.trilha;
    if (o.trilha?.rotulo) el.trilha.textContent = o.trilha.rotulo;
    raiz.classList.add('aberto');
    raiz.classList.remove('menu');
    document.documentElement.style.overflow = 'hidden';
    document.addEventListener('keydown', teclas);
    // Tela cheia some com as barras do navegador; precisa do toque do usuário, por isso aqui.
    try { raiz.requestFullscreen?.({ navigationUI: 'hide' })?.catch?.(() => {}); } catch { /* sem suporte (iOS) */ }
    try { history.pushState({ ttl: true }, ''); } catch { /* sem histórico */ }
    alternarMenu(true);
    el.ant.focus({ preventScroll: true });
    return carregar();
  }

  function fecharLeitor(porVoltar) {
    if (!raiz?.classList.contains('aberto')) return;
    raiz.classList.remove('aberto', 'menu');
    document.documentElement.style.overflow = '';
    document.removeEventListener('keydown', teclas);
    clearTimeout(timerMenu);
    if (timerProgresso && ultimoPct >= 0 && opcoes?.aoProgresso) { clearTimeout(timerProgresso); try { opcoes.aoProgresso(ultimoPct); } catch { /* idem */ } }
    destruir();
    estado(null);
    if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
    if (!porVoltar && history.state?.ttl) history.back();
    const fim = opcoes?.aoFechar;
    opcoes = null;
    try { fim?.(); } catch { /* idem */ }
  }

  // fechar(true) vem do botão "voltar" do aparelho: o histórico já voltou, não volta de novo.
  function fechar(porVoltar) { fecharLeitor(porVoltar === true); }
  // A trilha costuma chegar depois de abrir (outra consulta): mostra o botão quando vier.
  function definirTrilha(t) {
    if (!raiz || !opcoes) return;
    opcoes.trilha = t;
    el.trilha.hidden = !t;
    if (t?.rotulo) el.trilha.textContent = t.rotulo;
  }
  window.TTLeitor = { abrir, definirTrilha, fechar: () => fecharLeitor(false) };
})();
