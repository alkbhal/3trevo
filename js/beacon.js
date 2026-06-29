/**
 * beacon.js — Growth Engine Fase 4
 * Tracking frontend + pop-up captura de leads
 * Dispara eventos para POST /api/track (Worker)
 */
(function () {
  'use strict';

  var API = 'https://tres-trevo-api.al-kbhal.workers.dev';
  var ANON_KEY = '_tt_anon';
  var LEAD_SHOWN_KEY = '_tt_lead_shown';
  var LEAD_CAPTURED_KEY = '_tt_lead_ok';

  // ── Anon ID ────────────────────────────────────────────────────────────────
  function getAnonId() {
    var id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = 'a-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  }

  // ── UTM params ─────────────────────────────────────────────────────────────
  function getUtm() {
    var p = new URLSearchParams(window.location.search);
    var u = {};
    ['source', 'medium', 'campaign', 'content', 'term'].forEach(function (k) {
      var v = p.get('utm_' + k);
      if (v) u[k] = v;
    });
    return Object.keys(u).length ? u : null;
  }

  // ── Fire event ─────────────────────────────────────────────────────────────
  function track(eventType, props) {
    var payload = {
      anon_id: getAnonId(),
      event_type: eventType,
      page: location.pathname,
      utm: getUtm(),
      props: props || {}
    };
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API + '/api/track', JSON.stringify(payload));
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API + '/api/track', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify(payload));
    }
  }

  // ── Page view ──────────────────────────────────────────────────────────────
  track('page_view', { referrer: document.referrer || null, title: document.title });

  // ── Scroll depth (25/50/75/100) ────────────────────────────────────────────
  var scrollMarks = {};
  function onScroll() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    if (h <= 0) return;
    var pct = Math.round((window.scrollY / h) * 100);
    [25, 50, 75, 100].forEach(function (m) {
      if (pct >= m && !scrollMarks[m]) {
        scrollMarks[m] = true;
        track('scroll_depth', { depth: m });
        if (m === 50) maybeShowLeadPopup();
      }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  // ── CTA clicks ─────────────────────────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var el = e.target.closest('a[href*="checkout"], a[href*="catalogo"], .btn-comprar, [data-track]');
    if (!el) return;
    var label = el.getAttribute('data-track') || el.textContent.trim().substring(0, 40);
    var href = el.getAttribute('href') || '';
    track('cta_click', { label: label, href: href });
  });

  // ── Time on page ───────────────────────────────────────────────────────────
  var t0 = Date.now();
  window.addEventListener('beforeunload', function () {
    var secs = Math.round((Date.now() - t0) / 1000);
    track('time_on_page', { seconds: secs });
  });

  // ── 30s timer for lead popup ───────────────────────────────────────────────
  setTimeout(function () { maybeShowLeadPopup(); }, 30000);

  // ── Lead capture pop-up ────────────────────────────────────────────────────
  var popupShown = false;

  function maybeShowLeadPopup() {
    if (popupShown) return;
    if (localStorage.getItem(LEAD_CAPTURED_KEY)) return;
    if (sessionStorage.getItem(LEAD_SHOWN_KEY)) return;
    if (location.pathname.indexOf('admin') !== -1) return;
    popupShown = true;
    sessionStorage.setItem(LEAD_SHOWN_KEY, '1');
    showLeadPopup();
  }

  function showLeadPopup() {
    var overlay = document.createElement('div');
    overlay.id = 'tt-lead-overlay';
    overlay.innerHTML = [
      '<div class="tt-lead-box">',
      '  <button class="tt-lead-close" aria-label="Fechar">&times;</button>',
      '  <h3 class="tt-lead-title">Leia o 1º capítulo de graça</h3>',
      '  <p class="tt-lead-sub">Ficção documental que antecipa manchetes reais. Descubra por que este ebook está incomodando gente poderosa.</p>',
      '  <form id="tt-lead-form">',
      '    <input type="text" name="nome" placeholder="Seu nome" required class="tt-lead-input">',
      '    <input type="email" name="email" placeholder="Seu melhor e-mail" required class="tt-lead-input">',
      '    <input type="tel" name="whatsapp" placeholder="WhatsApp (opcional)" class="tt-lead-input">',
      '    <label class="tt-lead-check"><input type="checkbox" name="whatsapp_optin" value="1"> Receber novidades por WhatsApp</label>',
      '    <button type="submit" class="tt-lead-btn">Quero ler o 1º capítulo →</button>',
      '    <p class="tt-lead-msg" id="tt-lead-msg"></p>',
      '  </form>',
      '  <p class="tt-lead-fine">Sem spam. Cancele quando quiser.</p>',
      '</div>'
    ].join('\n');

    var style = document.createElement('style');
    style.textContent = [
      '#tt-lead-overlay{position:fixed;inset:0;background:rgba(5,15,7,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;animation:ttFadeIn .3s}',
      '@keyframes ttFadeIn{from{opacity:0}to{opacity:1}}',
      '.tt-lead-box{background:#fff;border-radius:8px;padding:36px 32px 28px;max-width:400px;width:100%;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.3)}',
      '.tt-lead-close{position:absolute;top:12px;right:14px;background:none;border:none;font-size:22px;color:#8a9a84;cursor:pointer;line-height:1}',
      '.tt-lead-close:hover{color:#111}',
      '.tt-lead-title{font-family:"Fraunces",Georgia,serif;font-size:22px;font-weight:300;color:#111a0e;margin-bottom:8px;line-height:1.25}',
      '.tt-lead-sub{font-size:14px;color:#5a6a54;line-height:1.55;margin-bottom:20px}',
      '.tt-lead-input{display:block;width:100%;padding:11px 14px;border:1px solid #e0dbd2;border-radius:4px;font-size:14px;font-family:"Instrument Sans",system-ui,sans-serif;margin-bottom:10px;outline:none;transition:border-color .2s}',
      '.tt-lead-input:focus{border-color:#2d7a50}',
      '.tt-lead-check{display:flex;align-items:center;gap:8px;font-size:12px;color:#5a6a54;margin-bottom:14px;cursor:pointer}',
      '.tt-lead-check input{accent-color:#2d7a50}',
      '.tt-lead-btn{display:block;width:100%;padding:13px;background:#1e5c3a;color:#fff;border:none;border-radius:4px;font-size:15px;font-weight:600;font-family:"Instrument Sans",system-ui,sans-serif;cursor:pointer;transition:background .2s}',
      '.tt-lead-btn:hover{background:#2d7a50}',
      '.tt-lead-btn:disabled{opacity:.6;cursor:wait}',
      '.tt-lead-msg{font-size:13px;text-align:center;margin-top:10px;min-height:18px}',
      '.tt-lead-fine{font-size:11px;color:#8a9a84;text-align:center;margin-top:12px}'
    ].join('\n');

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    overlay.querySelector('.tt-lead-close').addEventListener('click', function () {
      overlay.remove();
      track('lead_popup_closed');
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) { overlay.remove(); track('lead_popup_closed'); }
    });

    track('lead_popup_shown');

    document.getElementById('tt-lead-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target;
      var btn = form.querySelector('.tt-lead-btn');
      var msg = document.getElementById('tt-lead-msg');
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      msg.textContent = '';
      msg.style.color = '';

      var data = {
        nome: form.nome.value.trim(),
        email: form.email.value.trim(),
        whatsapp: form.whatsapp.value.trim() || null,
        anon_id: getAnonId(),
        utm: getUtm()
      };

      fetch(API + '/api/leads/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.ok) {
            localStorage.setItem(LEAD_CAPTURED_KEY, '1');
            track('lead_captured', { email_hash: data.email.length });
            msg.style.color = '#1e5c3a';
            msg.textContent = '✔ Pronto! Verifique seu e-mail.';
            btn.textContent = 'Enviado!';
            setTimeout(function () { overlay.remove(); }, 2500);
          } else {
            msg.style.color = '#c0392b';
            msg.textContent = res.erro === 'email_invalido' ? 'E-mail inválido.' : 'Erro ao cadastrar. Tente novamente.';
            btn.disabled = false;
            btn.textContent = 'Quero ler o 1º capítulo →';
          }
        })
        .catch(function () {
          msg.style.color = '#c0392b';
          msg.textContent = 'Falha na conexão. Tente novamente.';
          btn.disabled = false;
          btn.textContent = 'Quero ler o 1º capítulo →';
        });
    });
  }

  window.__ttTrack = track;
})();
