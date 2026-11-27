// js/vinheta.js — vinheta de abertura da página inicial.
// Sem som: a animação dura ~4 s. "Ouvir" liga a trilha (6,4 s): a animação segue o relógio do áudio, quadro a quadro.
// Toca uma vez por sessão. Não toca com "reduzir movimento", com link para uma seção (#...) nem se a página já abriu rolada.
// Pular: o botão, um toque, uma tecla ou uma rolagem fora dos botões. O áudio só começa com um clique (regra dos navegadores).
(function () {
  var el = document.getElementById('tt-vinheta');
  if (!el || el.hidden) return;

  var lang = (document.documentElement.lang || 'pt').slice(0, 2);
  var TXT = {
    pt: { desc: 'Editora', pular: 'Pular abertura', ouvir: 'Ouvir' },
    en: { desc: 'Publishing', pular: 'Skip intro', ouvir: 'Listen' },
    es: { desc: 'Editorial', pular: 'Saltar introducción', ouvir: 'Escuchar' }
  };
  var t = TXT[lang] || TXT.pt;
  el.querySelector('.vt-desc').textContent = t.desc;
  el.querySelector('.vt-pular').textContent = t.pular;
  el.querySelector('.vt-ouvir').textContent = t.ouvir;
  try { sessionStorage.setItem('tt-vinheta', '1'); } catch (e) { /* sem storage: toca de novo na próxima visita */ }

  var palco = el.querySelector('.vt-palco');
  var au = el.querySelector('audio');
  var svg = null, fim = false, pronto = false, timers = [], raf = 0;
  var eventos = ['pointerdown', 'keydown', 'wheel', 'touchmove'];

  function pararTimers() {
    timers.forEach(clearTimeout);
    timers = [];
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function sair() {
    if (fim) return;
    fim = true;
    pararTimers();
    au.pause();
    el.classList.add('vt-sai');
    document.documentElement.classList.remove('tt-vinheta');
    eventos.forEach(function (ev) { window.removeEventListener(ev, interrompe); });
    setTimeout(function () { el.remove(); }, 650);
  }
  function interrompe(e) {
    if (e.type === 'keydown' && e.key === 'Tab') return;
    if (e.target && e.target.closest && e.target.closest('.vt-btns')) return; // os botões não pulam a abertura
    sair();
  }
  function marcaNome() { el.classList.add('vt-nome'); }

  // Sem som: a animação roda sozinha e a vinheta sai em ~4,3 s.
  function silencio() {
    if (fim || pronto) return;
    pronto = true;
    timers.push(setTimeout(marcaNome, 2900));
    timers.push(setTimeout(sair, 4300));
    timers.push(setTimeout(sair, 7000)); // rede lenta: nunca prende o visitante
  }

  // Com som: o relógio do áudio comanda a animação.
  function quadro() {
    raf = 0;
    if (fim) return;
    var s = au.currentTime;
    if (svg) svg.setCurrentTime(Math.min(s, 3));
    if (s >= 2.9) marcaNome();
    if (!au.ended) raf = requestAnimationFrame(quadro);
  }
  function semSom() { // o áudio não tocou: volta à versão sem som
    if (fim) return;
    if (svg) { svg.setCurrentTime(0); svg.unpauseAnimations(); }
    pronto = false;
    silencio();
  }
  function ouvir() {
    if (fim) return;
    pararTimers();
    if (svg) { svg.pauseAnimations(); svg.setCurrentTime(0); }
    try { au.currentTime = 0; } catch (e) { /* ainda sem dados: começa do zero */ }
    var pr = null;
    try { pr = au.play(); } catch (e) { pr = null; }
    if (!pr || !pr.then) return semSom();
    pr.then(function () {
      timers.push(setTimeout(sair, 9000)); // rede lenta: nunca prende o visitante
      quadro();
    }, semSom);
  }

  au.addEventListener('ended', sair);
  el.querySelector('.vt-ouvir').addEventListener('click', ouvir);
  el.querySelector('.vt-pular').addEventListener('click', sair);
  eventos.forEach(function (ev) { window.addEventListener(ev, interrompe, { passive: true }); });

  // A animação entra inline para poder ser controlada pelo áudio. Se não chegar a tempo, a vinheta segue só com o texto.
  var seguro = setTimeout(silencio, 1500);
  fetch('/assets/marca/animado-negativo.svg')
    .then(function (r) { return r.ok ? r.text() : ''; })
    .then(function (txt) {
      clearTimeout(seguro);
      if (fim) return;
      if (txt) { palco.innerHTML = txt; svg = palco.querySelector('svg'); }
      silencio();
    }, function () { clearTimeout(seguro); silencio(); });
})();
