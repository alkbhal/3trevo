/**
 * player.js — Player musical full-width fixo na base
 * Inclua com: <script src="/js/player.js"></script>
 * API global: window.TTPlayer.play(id), .pause(), .next(), .prev(), .loadPlaylist(tracks)
 */
(function () {
  'use strict';

  const EDGE = (window.SUPABASE_URL || 'https://xfkepekffdyrtcgagwqo.supabase.co') + '/functions/v1';

  // ── Estado ────────────────────────────────────────────────────
  let playlist    = [];   // [{id, titulo, artista, genero, universo_slug, bg_color, capa_url, gratuita}]
  let currentIdx  = -1;
  let audio       = null;
  let signedUrl   = null;
  let urlExpiry   = 0;
  let dragging    = false;

  // ── CSS injetado ──────────────────────────────────────────────
  const CSS = `
#tt-player{
  position:fixed;bottom:0;left:0;right:0;z-index:9000;
  height:64px;background:#0a1f12;border-top:1px solid rgba(200,168,75,.2);
  display:none;align-items:center;gap:0;
  font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;
}
#tt-player.ativo{display:flex}
.ttp-capa{
  width:64px;height:64px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;
  font-size:22px;background:#0f2d1a;border-right:1px solid rgba(200,168,75,.1);
  overflow:hidden;
}
.ttp-capa img{width:100%;height:100%;object-fit:cover}
.ttp-info{
  flex:0 0 220px;padding:0 16px;min-width:0;
  display:flex;flex-direction:column;justify-content:center;gap:2px;
}
.ttp-titulo{font-size:13px;color:#f4efe5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500}
.ttp-sub{font-size:11px;color:rgba(200,168,75,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.3px}
.ttp-centro{
  flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:0 16px;
}
.ttp-controles{display:flex;align-items:center;gap:16px}
.ttp-btn{
  background:none;border:none;cursor:pointer;padding:4px;
  color:rgba(255,255,255,.5);transition:color .2s;display:flex;align-items:center;
}
.ttp-btn:hover{color:#f4efe5}
.ttp-btn-play{
  width:36px;height:36px;border-radius:50%;
  background:rgba(200,168,75,.15);border:1px solid rgba(200,168,75,.4) !important;
  color:#c8a84b !important;justify-content:center;
}
.ttp-btn-play:hover{background:rgba(200,168,75,.3) !important}
.ttp-btn svg{width:16px;height:16px;fill:currentColor}
.ttp-progresso-wrap{
  width:100%;display:flex;align-items:center;gap:8px;
}
.ttp-tempo{font-size:10px;color:rgba(255,255,255,.3);letter-spacing:.3px;flex-shrink:0;width:36px;text-align:center}
.ttp-barra{
  flex:1;height:3px;background:rgba(255,255,255,.12);cursor:pointer;position:relative;
  border-radius:2px;
}
.ttp-barra-fill{
  height:100%;background:#c8a84b;border-radius:2px;width:0%;
  pointer-events:none;transition:width .1s linear;
}
.ttp-barra:hover{height:5px}
.ttp-direita{
  flex:0 0 180px;display:flex;align-items:center;justify-content:flex-end;gap:12px;padding:0 16px;
}
.ttp-universo{
  font-size:10px;letter-spacing:2px;text-transform:uppercase;
  color:rgba(200,168,75,.6);border:1px solid rgba(200,168,75,.2);padding:3px 8px;
  white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis;
}
.ttp-volume{display:flex;align-items:center;gap:6px}
.ttp-vol-slider{
  -webkit-appearance:none;width:60px;height:3px;
  background:rgba(255,255,255,.15);border-radius:2px;cursor:pointer;
}
.ttp-vol-slider::-webkit-slider-thumb{
  -webkit-appearance:none;width:10px;height:10px;border-radius:50%;
  background:#c8a84b;cursor:pointer;
}
.ttp-fechar{
  width:32px;height:32px;display:flex;align-items:center;justify-content:center;
  cursor:pointer;color:rgba(255,255,255,.25);background:none;border:none;
  font-size:18px;transition:color .2s;flex-shrink:0;margin-right:8px;
}
.ttp-fechar:hover{color:rgba(255,255,255,.7)}
@media(max-width:768px){
  .ttp-info{flex:1;min-width:0}
  .ttp-direita{display:none}
  #tt-player{height:56px}
  .ttp-capa{width:56px;height:56px}
}
@media(max-width:480px){
  .ttp-info{flex:0 0 140px}
  .ttp-centro{padding:0 8px}
}`;

  // ── HTML do player ────────────────────────────────────────────
  const HTML = `
<div id="tt-player" role="region" aria-label="Player de música">
  <div class="ttp-capa" id="ttp-capa">🎵</div>
  <div class="ttp-info">
    <div class="ttp-titulo" id="ttp-titulo">—</div>
    <div class="ttp-sub" id="ttp-sub">Said Anes · Trilha autoral</div>
  </div>
  <div class="ttp-centro">
    <div class="ttp-controles">
      <button class="ttp-btn" id="ttp-prev" onclick="TTPlayer.prev()" title="Anterior" aria-label="Anterior">
        <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
      </button>
      <button class="ttp-btn ttp-btn-play" id="ttp-play" onclick="TTPlayer.toggle()" title="Play/Pause" aria-label="Play">
        <svg id="ttp-play-icon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
      </button>
      <button class="ttp-btn" id="ttp-next" onclick="TTPlayer.next()" title="Próxima" aria-label="Próxima">
        <svg viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6z"/></svg>
      </button>
    </div>
    <div class="ttp-progresso-wrap">
      <span class="ttp-tempo" id="ttp-atual">0:00</span>
      <div class="ttp-barra" id="ttp-barra" title="Clique para navegar">
        <div class="ttp-barra-fill" id="ttp-fill"></div>
      </div>
      <span class="ttp-tempo" id="ttp-total">0:00</span>
    </div>
  </div>
  <div class="ttp-direita">
    <div class="ttp-universo" id="ttp-universo" style="display:none"></div>
    <div class="ttp-volume">
      <svg width="14" height="14" fill="rgba(255,255,255,.35)" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>
      <input type="range" class="ttp-vol-slider" id="ttp-vol" min="0" max="1" step="0.05" value="0.8" title="Volume">
    </div>
  </div>
  <button class="ttp-fechar" onclick="TTPlayer.fechar()" aria-label="Fechar player">×</button>
</div>`;

  // ── Init ──────────────────────────────────────────────────────
  function init() {
    // Injetar CSS
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    // Injetar HTML no body
    const wrap = document.createElement('div');
    wrap.innerHTML = HTML;
    document.body.appendChild(wrap.firstElementChild);

    // Audio element
    audio = new Audio();
    audio.preload = 'none';
    audio.volume  = 0.8;

    // Eventos do audio
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended',      onEnded);
    audio.addEventListener('loadedmetadata', () => {
      document.getElementById('ttp-total').textContent = fmtTempo(audio.duration);
    });

    // Barra de progresso — clique e drag
    const barra = document.getElementById('ttp-barra');
    barra.addEventListener('mousedown', e => { dragging = true; seek(e); });
    barra.addEventListener('touchstart', e => { dragging = true; seek(e.touches[0]); });
    document.addEventListener('mousemove',  e => { if (dragging) seek(e); });
    document.addEventListener('touchmove',  e => { if (dragging) seek(e.touches[0]); });
    document.addEventListener('mouseup',    () => { dragging = false; });
    document.addEventListener('touchend',   () => { dragging = false; });

    // Volume
    document.getElementById('ttp-vol').addEventListener('input', e => {
      audio.volume = parseFloat(e.target.value);
    });

    // Carregar playlist do Supabase
    carregarPlaylist();

    // Persistência: retomar faixa da sessão anterior
    const saved = sessionStorage.getItem('tt_track_idx');
    if (saved !== null) currentIdx = parseInt(saved) - 1; // será incrementado no next()
  }

  async function carregarPlaylist() {
    try {
      const sbUrl = window.SUPABASE_URL || 'https://xfkepekffdyrtcgagwqo.supabase.co';
      const sbAnon = window.SUPABASE_ANON || '';
      const r = await fetch(sbUrl + '/rest/v1/musicas?ativo=eq.true&order=ordem.asc&select=id,titulo,artista,genero,universo_slug,bg_color,capa_url,gratuita,produto_id', {
        headers: { 'apikey': sbAnon, 'Authorization': 'Bearer ' + sbAnon }
      });
      const data = await r.json();
      if (Array.isArray(data) && data.length) {
        playlist = data;
      }
    } catch (e) { /* silencioso */ }
  }

  // ── Controles públicos ────────────────────────────────────────
  async function playTrack(idx) {
    if (!playlist.length) await carregarPlaylist();
    if (!playlist.length) return;
    idx = ((idx % playlist.length) + playlist.length) % playlist.length;
    currentIdx = idx;
    sessionStorage.setItem('tt_track_idx', idx);

    const t = playlist[idx];
    atualizarUI(t);
    setPlayIcon(false); // loading state

    // Buscar signed URL
    try {
      const headers = { 'Content-Type': 'application/json' };
      const authToken = await getAuthToken();
      if (authToken) headers['Authorization'] = 'Bearer ' + authToken;

      const r    = await fetch(EDGE + '/get-media?id=' + t.id, { headers });
      const data = await r.json();

      if (!r.ok) {
        if (r.status === 403) {
          // Bloqueada — redirecionar para checkout
          notificarBloqueada(t, data.universo_slug);
          return;
        }
        if (r.status === 401) {
          notificarLogin(t);
          return;
        }
        return;
      }

      audio.src     = data.url;
      signedUrl     = data.url;
      urlExpiry     = Date.now() + 55 * 60 * 1000;

      audio.play().then(() => setPlayIcon(true)).catch(() => {});
      document.getElementById('tt-player').classList.add('ativo');

    } catch (e) { /* silencioso */ }
  }

  function atualizarUI(t) {
    document.getElementById('ttp-titulo').textContent = t.titulo || '—';
    document.getElementById('ttp-sub').textContent    = (t.artista || 'Said Anes') + (t.genero ? ' · ' + t.genero : '');
    document.getElementById('ttp-atual').textContent  = '0:00';
    document.getElementById('ttp-total').textContent  = '0:00';
    document.getElementById('ttp-fill').style.width   = '0%';

    const capaEl = document.getElementById('ttp-capa');
    capaEl.style.background = t.bg_color || '#0f2d1a';
    capaEl.textContent = '';
    if (t.capa_url) {
      const img = document.createElement('img');
      img.src = t.capa_url;
      img.alt = 'Capa';
      capaEl.appendChild(img);
    } else {
      capaEl.textContent = '🎵';
    }

    const univEl = document.getElementById('ttp-universo');
    if (t.universo_slug) {
      univEl.textContent    = t.universo_slug.toUpperCase();
      univEl.style.display  = '';
    } else {
      univEl.style.display  = 'none';
    }
  }

  function setPlayIcon(playing) {
    const icon = document.getElementById('ttp-play-icon');
    const btn  = document.getElementById('ttp-play');
    if (!icon) return;
    icon.innerHTML = playing
      ? '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>'   // pause
      : '<path d="M8 5v14l11-7z"/>';                       // play
    btn.setAttribute('aria-label', playing ? 'Pausar' : 'Play');
  }

  function onTimeUpdate() {
    if (!audio.duration || dragging) return;
    const pct = audio.currentTime / audio.duration;
    document.getElementById('ttp-fill').style.width   = (pct * 100) + '%';
    document.getElementById('ttp-atual').textContent  = fmtTempo(audio.currentTime);

    // Renovar signed URL antes de expirar
    if (signedUrl && Date.now() > urlExpiry) {
      urlExpiry = Date.now() + 55 * 60 * 1000; // evitar loop
      playTrack(currentIdx);
    }
  }

  function onEnded() {
    setPlayIcon(false);
    if (playlist.length > 1) playTrack(currentIdx + 1);
  }

  function seek(e) {
    const barra = document.getElementById('ttp-barra');
    const rect  = barra.getBoundingClientRect();
    const pct   = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (audio.duration) {
      audio.currentTime = pct * audio.duration;
      document.getElementById('ttp-fill').style.width  = (pct * 100) + '%';
      document.getElementById('ttp-atual').textContent = fmtTempo(audio.currentTime);
    }
  }

  function fmtTempo(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  async function getAuthToken() {
    try {
      if (!window.sb) return null;
      const { data: { session } } = await window.sb.auth.getSession();
      return session?.access_token || null;
    } catch { return null; }
  }

  function notificarBloqueada(t, universoSlug) {
    document.getElementById('tt-player').classList.add('ativo');
    document.getElementById('ttp-titulo').textContent = '🔒 ' + (t.titulo || '—');
    document.getElementById('ttp-sub').textContent    = 'Adquira o livro para desbloquear';
    setPlayIcon(false);
    if (universoSlug) {
      setTimeout(() => {
        if (confirm('Esta faixa é exclusiva para leitores do universo "' + universoSlug + '".\nDeseja adquirir o livro?')) {
          window.location.href = '/checkout.html?slug=' + universoSlug;
        }
      }, 300);
    }
  }

  function notificarLogin(t) {
    document.getElementById('tt-player').classList.add('ativo');
    document.getElementById('ttp-sub').textContent = 'Faça login para ouvir esta faixa';
    setPlayIcon(false);
  }

  // ── API pública ───────────────────────────────────────────────
  window.TTPlayer = {
    play:         (id) => {
      const idx = id ? playlist.findIndex(t => t.id === id) : 0;
      playTrack(idx >= 0 ? idx : 0);
    },
    toggle: () => {
      if (!playlist.length) { playTrack(0); return; }
      if (audio.paused) {
        if (!audio.src) { playTrack(currentIdx >= 0 ? currentIdx : 0); return; }
        audio.play().then(() => setPlayIcon(true));
      } else {
        audio.pause();
        setPlayIcon(false);
      }
    },
    next:   () => playTrack(currentIdx + 1),
    prev:   () => playTrack(currentIdx - 1 < 0 ? playlist.length - 1 : currentIdx - 1),
    fechar: () => {
      audio.pause();
      setPlayIcon(false);
      document.getElementById('tt-player').classList.remove('ativo');
    },
    loadPlaylist: (tracks) => {
      playlist = tracks;
    },
    getPlaylist:  () => playlist,
    isPlaying:    () => !audio.paused,
    show:         () => document.getElementById('tt-player').classList.add('ativo'),
  };

  // Inicializar quando DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
