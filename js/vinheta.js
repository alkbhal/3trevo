// js/vinheta.js — vinheta de abertura da página inicial (3 s): os dois traços se encontram, o coração se abre no trevo.
// Toca uma vez por sessão. Não toca com "reduzir movimento", com link direto para uma seção (#...) nem se o visitante já rolou.
// Qualquer toque, tecla ou rolagem pula a vinheta. Sem som: o navegador não deixa tocar áudio sem um clique.
(function () {
  var el = document.getElementById('tt-vinheta');
  if (!el || el.hidden) return;
  var lang = (document.documentElement.lang || 'pt').slice(0, 2);
  var DESC = { pt: 'Editora', en: 'Publishing', es: 'Editorial' };
  var PULAR = { pt: 'Pular abertura', en: 'Skip intro', es: 'Saltar introducción' };
  el.querySelector('.vt-desc').textContent = DESC[lang] || DESC.pt;
  var bt = el.querySelector('.vt-pular');
  bt.textContent = PULAR[lang] || PULAR.pt;
  try { sessionStorage.setItem('tt-vinheta', '1'); } catch (e) { /* sem storage: toca de novo na próxima visita */ }

  var fim = false, timers = [];
  function sair() {
    if (fim) return; fim = true;
    timers.forEach(clearTimeout);
    el.classList.add('vt-sai');
    document.documentElement.classList.remove('tt-vinheta');
    setTimeout(function () { el.remove(); }, 650);
    ['pointerdown', 'keydown', 'wheel', 'touchmove'].forEach(function (ev) { window.removeEventListener(ev, sair); });
  }
  function comecar() {
    timers.push(setTimeout(function () { el.classList.add('vt-nome'); }, 2900));
    timers.push(setTimeout(sair, 4300));
  }
  var img = el.querySelector('img');
  if (img.complete) comecar(); else { img.addEventListener('load', comecar); img.addEventListener('error', sair); }
  timers.push(setTimeout(sair, 7000)); // rede lenta: nunca prende o visitante
  bt.addEventListener('click', sair);
  ['pointerdown', 'keydown', 'wheel', 'touchmove'].forEach(function (ev) { window.addEventListener(ev, sair, { passive: true }); });
})();
