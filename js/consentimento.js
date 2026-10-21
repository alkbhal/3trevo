// js/consentimento.js — aviso de cookies (LGPD).
// Google Analytics e Meta Pixel só carregam depois que o visitante clica em "Aceitar".
// A escolha fica no localStorage ('tt-consentimento' = 'aceito' | 'recusado').
// Evento extra do pixel por página: <script src="/js/consentimento.js" data-fb="ViewContent">.
// Eventos de conversão: TTConsent.evento('purchase', {...}) — ignorado sem consentimento.
(function () {
  var GA_ID = 'G-Q64TDCCL85';
  var PIXEL_ID = '296545814480082';
  var CHAVE = 'tt-consentimento';
  var tag = document.currentScript;
  var fbEvento = tag && tag.getAttribute('data-fb');
  var lang = (document.documentElement.lang || 'pt').slice(0, 2);
  var TXT = {
    pt: { msg: 'Usamos cookies de medição (Google Analytics e Meta) para entender as visitas e melhorar o site. Eles só são ativados se você aceitar.',
          aceitar: 'Aceitar', recusar: 'Recusar', mais: 'Política de privacidade', link: '/privacidade.html' },
    en: { msg: 'We use measurement cookies (Google Analytics and Meta) to understand visits and improve the site. They are only turned on if you accept.',
          aceitar: 'Accept', recusar: 'Decline', mais: 'Privacy policy', link: '/en/privacidade.html' },
    es: { msg: 'Usamos cookies de medición (Google Analytics y Meta) para entender las visitas y mejorar el sitio. Solo se activan si aceptas.',
          aceitar: 'Aceptar', recusar: 'Rechazar', mais: 'Política de privacidad', link: '/es/privacidade.html' }
  };
  var t = TXT[lang] || TXT.pt;

  function ler() { try { return localStorage.getItem(CHAVE); } catch (e) { return null; } }
  function gravar(v) { try { localStorage.setItem(CHAVE, v); } catch (e) { /* modo privado: vale só nesta visita */ } }

  var carregado = false;
  function carregar() {
    if (carregado) return;
    carregado = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(g);

    !function (f, b, e, v, n, t2, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t2 = b.createElement(e); t2.async = !0; t2.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t2, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
    if (fbEvento && fbEvento !== 'PageView') window.fbq('track', fbEvento);
  }

  function aviso() {
    var box = document.createElement('div');
    box.id = 'tt-consentimento';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', t.mais);
    box.innerHTML =
      '<p style="margin:0;flex:1 1 280px;font-size:13px;line-height:1.5">' + t.msg +
      ' <a href="' + t.link + '" style="color:#d6b762;text-decoration:underline">' + t.mais + '</a></p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button type="button" data-v="recusado" style="padding:9px 16px;border:1px solid rgba(255,255,255,.45);background:transparent;color:#fff;font:inherit;font-size:13px;cursor:pointer">' + t.recusar + '</button>' +
      '<button type="button" data-v="aceito" style="padding:9px 18px;border:0;background:#d6b762;color:#0f2d1a;font:inherit;font-size:13px;font-weight:600;cursor:pointer">' + t.aceitar + '</button></div>';
    box.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:10000;display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center;' +
      'padding:14px max(16px,env(safe-area-inset-right,0px)) calc(14px + env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px));' +
      'background:#0f2d1a;color:#f4efe5;font-family:Poppins,system-ui,sans-serif;box-shadow:0 -4px 20px rgba(0,0,0,.25)';
    box.addEventListener('click', function (e) {
      var v = e.target && e.target.getAttribute && e.target.getAttribute('data-v');
      if (!v) return;
      gravar(v);
      box.remove();
      document.documentElement.classList.remove('tt-com-aviso');
      if (v === 'aceito') carregar();
    });
    document.body.appendChild(box);
    document.documentElement.classList.add('tt-com-aviso');
  }

  window.TTConsent = {
    aceito: function () { return ler() === 'aceito'; },
    evento: function (nome, params) {
      if (ler() !== 'aceito') return;
      carregar();
      if (nome === 'purchase') {
        window.gtag('event', 'purchase', params || {});
        window.fbq('track', 'Purchase', { value: params && params.value, currency: (params && params.currency) || 'BRL' });
      } else {
        window.gtag('event', nome, params || {});
      }
    },
    reabrir: function () { if (!document.getElementById('tt-consentimento')) aviso(); }
  };

  var escolha = ler();
  if (escolha === 'aceito') carregar();
  else if (escolha !== 'recusado') {
    if (document.body) aviso(); else document.addEventListener('DOMContentLoaded', aviso);
  }
})();
