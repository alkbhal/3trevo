/**
 * beacon.js — Growth Engine Fase 4
 * Tracking frontend + pop-up de cadastro de membro grátis (amostra + clássico)
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
        if (m === 100) maybeShowLeadPopup();
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

  // ── Gatilhos do pop-up: fim da página (acima) ou intenção de saída no desktop ──
  // Só existe se houver amostra real para entregar (AMOSTRA_PRONTA); sem arquivo, não promete.
  var AMOSTRA_PRONTA = true;
  document.addEventListener('mouseout', function (e) {
    if (!e.relatedTarget && e.clientY <= 0) maybeShowLeadPopup();
  });

  // ── Lead capture pop-up ────────────────────────────────────────────────────
  var popupShown = false;

  function maybeShowLeadPopup() {
    if (popupShown) return;
    if (!AMOSTRA_PRONTA) return;
    if (localStorage.getItem(LEAD_CAPTURED_KEY)) return;
    if (sessionStorage.getItem(LEAD_SHOWN_KEY)) return;
    if (location.pathname.indexOf('admin') !== -1) return;
    // Não interrompe a abertura imersiva: espera o leitor sair dela.
    var ab = document.getElementById('abertura');
    if (ab) {
      var r = ab.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) { setTimeout(maybeShowLeadPopup, 10000); return; }
    }
    popupShown = true;
    sessionStorage.setItem(LEAD_SHOWN_KEY, '1');
    showLeadPopup();
  }

  // ── Cadastro de membro grátis ─────────────────────────────────────────────
  // Cria a conta pelo link de acesso do Supabase (sem senha): o e-mail leva direto à
  // área do cliente, onde ficam a amostra, o clássico grátis e o cartão do Nema.
  // A mala direta (sequência de e-mails do Worker) só entra com o consentimento marcado.
  var T = function (k, v) { return window.T ? window.T(k, v) : k; };
  var LANG = window.TT_LANG || 'pt';
  var PREFIXO = LANG === 'pt' ? '' : '/' + LANG;
  var SB_URL = 'https://xfkepekffdyrtcgagwqo.supabase.co';
  var SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhma2VwZWtmZmR5cnRjZ2Fnd3FvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzkyMTMsImV4cCI6MjA5MDE1NTIxM30.UtCfSrLZlJanIUMlQKE_nEr9YKIvBhPIaIdQPcQfGTI';

  function criarMembro(dados) {
    var email = (dados.email || '').trim().toLowerCase();
    var nome = (dados.nome || '').trim().slice(0, 120);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Promise.resolve({ ok: false, erro: 'email_invalido' });
    var destino = location.origin + PREFIXO + '/area-cliente.html';
    var conta = fetch(SB_URL + '/auth/v1/otp?redirect_to=' + encodeURIComponent(destino), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON },
      body: JSON.stringify({
        email: email,
        create_user: true,
        data: { nome: nome, idioma: LANG, origem: dados.origem || 'amostra', mala_direta: !!dados.malaDireta, consentimento_em: dados.malaDireta ? new Date().toISOString() : null }
      })
    }).then(function (r) {
      if (r.ok) return { ok: true };
      return { ok: false, erro: r.status === 429 ? 'muitas_tentativas' : 'falha' };
    }).catch(function () { return { ok: false, erro: 'conexao' }; });

    // A sequência de e-mails do Worker é só em português: só entra no site PT.
    if (dados.malaDireta && LANG === 'pt') {
      fetch(API + '/api/leads/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: nome, email: email, anon_id: getAnonId(), utm: getUtm() || {} })
      }).catch(function () {});
    }
    return conta.then(function (res) {
      if (res.ok) {
        localStorage.setItem(LEAD_CAPTURED_KEY, '1');
        track('membro_cadastro', { origem: dados.origem || 'amostra', mala_direta: !!dados.malaDireta });
      }
      return res;
    });
  }

  function mensagemErro(erro) {
    if (erro === 'email_invalido') return T('js.cad.erro.email');
    if (erro === 'muitas_tentativas') return T('js.cad.erro.tentativas');
    if (erro === 'conexao') return T('js.cad.erro.conexao');
    return T('js.cad.erro.geral');
  }

  function showLeadPopup() {
    var overlay = document.createElement('div');
    overlay.id = 'tt-lead-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'tt-lead-title');
    overlay.innerHTML = [
      '<div class="tt-lead-box">',
      '  <button class="tt-lead-close" aria-label="' + T('js.cad.fechar') + '">&times;</button>',
      '  <p class="tt-lead-kicker">✦ ' + T('js.cad.kicker') + '</p>',
      '  <h3 class="tt-lead-title" id="tt-lead-title">' + T('js.cad.titulo') + '</h3>',
      '  <p class="tt-lead-sub">' + T('js.cad.sub') + '</p>',
      '  <form id="tt-lead-form" novalidate>',
      '    <input type="text" name="nome" placeholder="' + T('js.cad.nome') + '" autocomplete="given-name" required class="tt-lead-input">',
      '    <input type="email" name="email" placeholder="' + T('js.cad.email') + '" autocomplete="email" required class="tt-lead-input">',
      (LANG === 'pt' ? '    <label class="tt-lead-check"><input type="checkbox" name="mala_direta" value="1"> ' + T('js.cad.mala') + '</label>' : ''),
      '    <button type="submit" class="tt-lead-btn">' + T('js.cad.botao') + '</button>',
      '    <p class="tt-lead-msg" id="tt-lead-msg" role="status"></p>',
      '  </form>',
      '  <p class="tt-lead-fine">' + (LANG === 'pt' ? T('js.cad.fino') : T('js.cad.fino.intl')) + '</p>',
      '</div>'
    ].join('\n');

    var style = document.createElement('style');
    style.textContent = [
      '#tt-lead-overlay{position:fixed;inset:0;background:rgba(5,15,7,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;animation:ttFadeIn .3s}',
      '@keyframes ttFadeIn{from{opacity:0}to{opacity:1}}',
      '.tt-lead-box{background:#fffdf9;border-radius:10px;padding:32px 28px 24px;max-width:420px;width:100%;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.3);border-top:4px solid #1e5c3a;max-height:calc(100vh - 32px);overflow-y:auto}',
      '.tt-lead-close{position:absolute;top:8px;right:8px;width:44px;height:44px;background:none;border:none;font-size:24px;color:#8a9a84;cursor:pointer;line-height:1}',
      '.tt-lead-close:hover{color:#111}',
      '.tt-lead-kicker{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a6f28;margin:0 0 8px;font-family:"Instrument Sans",system-ui,sans-serif}',
      '.tt-lead-title{font-family:"Fraunces",Georgia,serif;font-size:24px;font-weight:600;color:#111a0e;margin:0 0 8px;line-height:1.2}',
      '.tt-lead-sub{font-size:15px;color:#3d4a41;line-height:1.55;margin:0 0 18px;font-family:"Instrument Sans",system-ui,sans-serif}',
      '.tt-lead-input{display:block;width:100%;box-sizing:border-box;padding:13px 14px;border:1px solid #d8d2c6;border-radius:6px;font-size:16px;font-family:"Instrument Sans",system-ui,sans-serif;margin-bottom:10px;outline:none;transition:border-color .2s;background:#fff}',
      '.tt-lead-input:focus{border-color:#2d7a50}',
      '.tt-lead-check{display:flex;align-items:flex-start;gap:10px;font-size:13.5px;line-height:1.45;color:#3d4a41;margin:4px 0 16px;cursor:pointer;font-family:"Instrument Sans",system-ui,sans-serif}',
      '.tt-lead-check input{accent-color:#1e5c3a;width:18px;height:18px;flex-shrink:0;margin-top:1px}',
      '.tt-lead-btn{display:block;width:100%;min-height:50px;padding:13px;background:#1e5c3a;color:#fff;border:none;border-radius:6px;font-size:16px;font-weight:600;font-family:"Instrument Sans",system-ui,sans-serif;cursor:pointer;transition:background .2s}',
      '.tt-lead-btn:hover{background:#2d7a50}',
      '.tt-lead-btn:disabled{opacity:.6;cursor:wait}',
      '.tt-lead-msg{font-size:14px;line-height:1.5;text-align:center;margin:10px 0 0;min-height:18px;font-family:"Instrument Sans",system-ui,sans-serif}',
      '.tt-lead-fine{font-size:12px;line-height:1.5;color:#6b7a66;text-align:center;margin:12px 0 0;font-family:"Instrument Sans",system-ui,sans-serif}'
    ].join('\n');

    document.head.appendChild(style);
    document.body.appendChild(overlay);

    function fechar() { overlay.remove(); track('lead_popup_closed'); }
    overlay.querySelector('.tt-lead-close').addEventListener('click', fechar);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) fechar(); });
    document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape' && document.body.contains(overlay)) { fechar(); document.removeEventListener('keydown', esc); } });

    track('lead_popup_shown');

    document.getElementById('tt-lead-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target;
      var btn = form.querySelector('.tt-lead-btn');
      var msg = document.getElementById('tt-lead-msg');
      btn.disabled = true;
      btn.textContent = T('js.cad.criando');
      msg.textContent = '';
      msg.style.color = '';
      criarMembro({ nome: form.nome.value, email: form.email.value, malaDireta: !!(form.mala_direta && form.mala_direta.checked), origem: 'popup' })
        .then(function (res) {
          if (res.ok) {
            form.innerHTML = '<p class="tt-lead-msg" style="color:#1e5c3a;font-size:15px">✦ ' +
              T('js.cad.ok', { email: '<strong>' + form.email.value.replace(/[<>&"]/g, '') + '</strong>' }) + '</p>';
          } else {
            msg.style.color = '#b23b2e';
            msg.textContent = mensagemErro(res.erro);
            btn.disabled = false;
            btn.textContent = T('js.cad.botao');
          }
        });
    });
  }

  window.TTCadastro = { criarMembro: criarMembro, mensagemErro: mensagemErro };
  window.__ttTrack = track;
})();
