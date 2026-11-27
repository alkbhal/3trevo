// Prova visual e funcional de uma página de obra contra a versão anterior.
// Uso (da raiz do repo, com o site servido localmente):
//   python3 -m http.server 8766            # em outro terminal, na raiz (ou numa pasta com a página nova e a antiga)
//   npm i --prefix /tmp/prova axe-core       # o Playwright já vem instalado no ambiente
//   NODE_PATH=/tmp/prova/node_modules:$(npm root -g) BASE=http://localhost:8766 \
//     PAGINA=/obra/<slug>.html HOJE=/obra/<slug>-anterior.html \
//     node .claude/skills/pagina-de-obra/arquivos/prova-pagina-obra.js /tmp/prova/capturas
// Mostra uma linha por conferência: PASSOU, FALHOU ou NÃO CONFERIDO, com a prova.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const BASE = process.env.BASE || 'http://localhost:8766';
const PAGINA = process.env.PAGINA || '/obra/direcao-bc.html';
const HOJE = process.env.HOJE || '/obra/hoje.html';
const SLUG = process.env.SLUG || (PAGINA.match(/obra\/([a-z0-9-]+)\.html$/) || [])[1] || 'livre-das-dividas';
const out = process.argv[2];
const R = [];
const res = (id, ok, prova) => { R.push({ id, ok, prova }); console.log(`${ok === null ? 'NÃO CONFERIDO' : ok ? 'PASSOU' : 'FALHOU'} | ${id} | ${prova}`); };

const CELULARES = [[360, 640], [375, 667], [390, 844], [412, 915]];
const HERO = ['h1.obra-titulo', '.obra-desc', '.obra-mockup-grande img', '.ficha', '.obra-preco', '.btn-adquirir'];

async function abrir(b, url, vp, recusar = true) {
  const p = await b.newPage({ viewport: { width: vp[0], height: vp[1] } });
  await p.goto(BASE + url, { waitUntil: 'networkidle' }).catch(() => {});
  if (recusar) await p.click('#tt-consentimento button[data-v="recusado"]', { timeout: 3000 }).catch(() => {});
  await p.evaluate(() => document.querySelectorAll('.reveal').forEach(e => e.classList.add('visivel')));
  await p.waitForTimeout(700);
  return p;
}
const rects = (p, sels) => p.evaluate((sels) => sels.map(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { s, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }), sels);
const cruza = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;

(async () => {
  const b = await chromium.launch();

  // 1. Primeira tela do celular: tudo visível sem rolar (com e sem o aviso de cookies)
  for (const vp of CELULARES) {
    for (const comAviso of [false, true]) {
      const p = await abrir(b, PAGINA, vp, !comAviso);
      const rs = await rects(p, HERO);
      const limite = comAviso ? await p.evaluate(() => { const a = document.getElementById('tt-consentimento'); return a ? a.getBoundingClientRect().top : innerHeight; }) : vp[1];
      const fora = rs.filter(r => !r || r.bottom > limite || r.top < 0).map(r => r ? `${r.s} termina em ${Math.round(r.bottom)}px` : 'elemento ausente');
      res(`primeira tela ${vp[0]}x${vp[1]}${comAviso ? ' com aviso de cookies' : ''}`, fora.length === 0,
        fora.length ? `limite ${Math.round(limite)}px; fora: ${fora.join('; ')}` : `título, texto, capa, 3 números, preço e botão acima de ${Math.round(limite)}px`);
      // 2. Nada sobreposto na primeira tela
      const sobre = [];
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (rs[i] && rs[j] && cruza(rs[i], rs[j]) && !(rs[i].s.includes('ficha') && rs[j].s.includes('ficha'))) sobre.push(`${rs[i].s} × ${rs[j].s}`);
      if (!comAviso) res(`sem sobreposição na primeira tela ${vp[0]}x${vp[1]}`, sobre.length === 0, sobre.length ? sobre.join('; ') : `${rs.length} blocos sem interseção`);
      if (!comAviso) {
        const vaza = await p.evaluate(() => {
          const r = [], w = document.createTreeWalker(document.querySelector('.obra-hero'), NodeFilter.SHOW_TEXT);
          while (w.nextNode()) { const t = w.currentNode; if (!t.textContent.trim()) continue; const el = t.parentElement;
            if (el.closest('.obra-breadcrumb')) continue; // corte com reticências proposital
            const g = document.createRange(); g.selectNodeContents(t); const tr = g.getBoundingClientRect(), er = el.getBoundingClientRect();
            if (tr.width && (tr.left < er.left - 1 || tr.right > er.right + 1)) r.push(`"${t.textContent.trim().slice(0, 25)}" sai de .${el.className}`);
            const caixa = el.closest('.obra-preco-badge,.ficha li,.btn-adquirir'); if (caixa) { const cr = caixa.getBoundingClientRect(); if (tr.width && (tr.left < cr.left - 1 || tr.right > cr.right + 1)) r.push(`"${t.textContent.trim().slice(0, 25)}" vaza de .${caixa.className.split(' ')[0]}`); } }
          return r; });
        res(`nenhum texto vazando da caixa ${vp[0]}x${vp[1]}`, vaza.length === 0, vaza.length ? vaza.join('; ') : 'todo texto da primeira tela dentro da sua caixa');
      }
      if (!comAviso && vp[0] === 390) await p.screenshot({ path: path.join(out, 'bc-cel1.png') });
      await p.close();
    }
  }

  // 3. Elementos flutuantes não cobrem texto ao rolar a página inteira
  for (const vp of [[390, 844], [1280, 800]]) {
    const p = await abrir(b, PAGINA, vp);
    const altura2 = await p.evaluate(() => document.body.scrollHeight);
    const sobreTexto = new Set();
    for (let y = 0; y < altura2; y += 200) {
      await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(250);
      (await p.evaluate(() => {
        const fl = [...document.querySelectorAll('body *')].filter(e => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.position === 'fixed' && cs.display !== 'none' && r.height > 0 && r.top < innerHeight && !e.matches('#navbar,.nav-mobile,.compra-fixa,#tt-consentimento'); });
        const out = [];
        for (const f of fl) { const fr = f.getBoundingClientRect(); const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          while (w.nextNode()) { const t = w.currentNode; if (!t.textContent.trim() || f.contains(t) || t.parentElement.closest('#navbar,.compra-fixa,#tt-consentimento,script,style')) continue;
            const g = document.createRange(); g.selectNodeContents(t); for (const tr of g.getClientRects()) if (tr.left < fr.right && fr.left < tr.right && tr.top < fr.bottom && fr.top < tr.bottom) { out.push(`${f.id || f.className} sobre "${t.textContent.trim().slice(0, 30)}"`); break; } } }
        return out; })).forEach(x => sobreTexto.add(x));
    }
    res(`nenhum botão flutuante sobre texto ${vp[0]}px`, sobreTexto.size === 0, sobreTexto.size ? [...sobreTexto].slice(0, 4).join(' | ') : `rolado de 0 a ${altura2}px em passos de 200px`);
    await p.close();
  }
  {
    const p = await abrir(b, PAGINA, [390, 844]);
    const altura = await p.evaluate(() => document.body.scrollHeight);
    const conflitos = [];
    for (let y = 0; y < altura; y += 300) {
      await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(300);
      const c = await p.evaluate(() => {
        const flut = [...document.querySelectorAll('body *')].filter(e => { const cs = getComputedStyle(e); return cs.position === 'fixed' && cs.display !== 'none' && cs.visibility !== 'hidden' && e.id !== 'navbar' && !e.classList.contains('nav-mobile') && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().top < innerHeight; });
        const barra = document.querySelector('.compra-fixa');
        const visiveis = flut.filter(e => e !== barra);
        return visiveis.map(e => e.id || e.className);
      });
      if (c.length) conflitos.push(`y=${y}: ${c.join(',')}`);
    }
    res('nenhum botão flutuante sobre o texto (WhatsApp na barra)', conflitos.length === 0, conflitos.length ? conflitos.slice(0, 3).join(' | ') : `página rolada de 0 a ${altura}px em passos de 300px; só a barra fixa flutua, e ela empurra o conteúdo com padding-bottom`);
    const wa = await p.evaluate(() => { const a = document.querySelector('.compra-fixa-wa'); return a && a.href; });
    res('WhatsApp continua acessível no celular', !!wa && wa.startsWith('https://wa.me/5554999467085'), wa || 'link ausente');
    await p.close();
  }

  // 4. Barra fixa e aviso de cookies
  {
    const p = await abrir(b, PAGINA, [390, 844], false);
    const comAviso = await p.evaluate(() => getComputedStyle(document.querySelector('.compra-fixa')).display);
    res('barra fixa some enquanto o aviso de cookies está aberto', comAviso === 'none', `display da barra com aviso: ${comAviso}`);
    await p.click('#tt-consentimento button[data-v="recusado"]'); await p.waitForTimeout(400);
    const noTopo = await p.evaluate(() => document.querySelector('.compra-fixa').classList.contains('visivel'));
    await p.evaluate(() => scrollTo(0, 900)); await p.waitForTimeout(600);
    const rolado = await p.evaluate(() => { const e = document.querySelector('.compra-fixa'); return e.classList.contains('visivel') && e.getBoundingClientRect().bottom <= innerHeight + 1; });
    res('barra fixa não concorre com o botão da primeira tela', !noTopo && rolado, `no topo: ${noTopo ? 'visível' : 'escondida'}; após rolar 900px: ${rolado ? 'visível' : 'escondida'}`);
    const fundo = await p.evaluate(() => getComputedStyle(document.body).paddingBottom);
    res('fim da página não fica escondido atrás da barra', parseInt(fundo) >= 64, `padding-bottom do body: ${fundo}`);
    await p.close();
  }

  // 5. Sem rolagem horizontal, celular e computador
  for (const vp of [...CELULARES, [768, 1024], [1280, 800], [1440, 900]]) {
    const p = await abrir(b, PAGINA, vp);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    res(`sem rolagem horizontal ${vp[0]}x${vp[1]}`, sw <= vp[0], `scrollWidth ${sw}px`);
    if (vp[0] === 1280) await p.screenshot({ path: path.join(out, 'bc-pc1.png') });
    await p.close();
  }

  // 6. Oferta idêntica à página atual
  const extrair = async (url) => { const p = await abrir(b, url, [390, 844]); const d = await p.evaluate(() => ({
    desc: (document.querySelector('.obra-desc').textContent.trim() + ' ' + ((document.querySelector('.obra-lead') || {}).textContent || '')).trim(),
    capa: document.querySelector('.obra-mockup-grande img').getAttribute('src'),
    preco: document.querySelector('[id^="preco-"]').textContent.trim(),
    ficha: [...document.querySelectorAll('.ficha li b')].map(b => b.textContent.trim()),
    barra: document.querySelector('.compra-fixa-preco').textContent.trim(),
    faixa: document.querySelector('.obra-faixa').textContent.trim(),
    cotas: document.querySelector('.obra-cotas').textContent.replace(/\s+/g, ''),
    compra: [...new Set([...document.querySelectorAll('a[href*="checkout"]')].map(a => a.getAttribute('href')))],
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent.trim()),
    texto: [...document.querySelector('.obra-content').childNodes].map(n => n.textContent).join(' ').replace((document.querySelector('.obra-lead') || {}).textContent || '\u0000', '').replace(/\s+/g, ' ').trim(),
  })); await p.close(); return d; };
  const hoje = await extrair(HOJE), bc = await extrair(PAGINA);
  for (const k of ['desc', 'capa', 'preco', 'barra', 'faixa', 'cotas', 'texto'])
    res(`oferta idêntica: ${k}`, hoje[k] === bc[k], hoje[k] === bc[k] ? `igual (${String(bc[k]).slice(0, 60)}${String(bc[k]).length > 60 ? '…' : ''})` : `hoje "${hoje[k]}" × rascunho "${bc[k]}"`);
  res('destino do botão de compra idêntico', JSON.stringify(hoje.compra) === JSON.stringify(bc.compra) && bc.compra.length === 1, `todos os links de compra → ${bc.compra.join(', ')}`);
  res('JSON-LD idêntico (preço 15.35 na marcação)', JSON.stringify(hoje.ld) === JSON.stringify(bc.ld), `${bc.ld.length} blocos iguais`);
  { const ld = (bc.ld[0].match(/"price":"([\d.]+)"/) || [])[1];
    res('preço exibido = preço da marcação', !!ld && bc.preco === 'R$' + Number(ld).toFixed(2).replace('.', ','), `${bc.preco} na tela, ${ld} no JSON-LD`); }

  // 7. Os 3 números estão no texto já publicado da página
  const txt = hoje.texto;
  const EXTENSO = { 1: 'um|uma', 2: 'dois|duas', 3: 'três', 4: 'quatro', 5: 'cinco', 6: 'seis', 7: 'sete', 8: 'oito', 9: 'nove', 10: 'dez', 12: 'doze', 15: 'quinze', 20: 'vinte' };
  for (const n of bc.ficha) { const re = new RegExp('(^|[^\\d])(' + n + (EXTENSO[n] ? '|' + EXTENSO[n] : '') + ')([^\\d]|$)', 'i'); const m = txt.match(re);
    res(`número da ficha aparece no texto da página: ${n}`, !!m, m ? `"${m[2]}" no texto; conferir também no livro entregue` : 'não encontrado no texto'); }
  if (!bc.ficha.length) res('ficha com os números do livro', false, 'nenhum número em .ficha');

  // 8. Botão de compra leva ao checkout certo
  {
    const p = await abrir(b, PAGINA, [390, 844]);
    await Promise.all([p.waitForNavigation({ timeout: 8000 }).catch(() => {}), p.click('.obra-acoes .btn-adquirir')]);
    const u = new URL(p.url());
    const st = await p.evaluate(() => document.title);
    res('botão da primeira tela abre o checkout do livro', u.pathname === '/checkout.html' && u.searchParams.get('slug') === SLUG, `${u.pathname}${u.search} — "${st}"`);
    await p.close();
  }

  // 9. Acessibilidade (axe-core, WCAG 2 AA) e contraste
  for (const vp of [[390, 844], [1280, 800]]) {
    for (const url of (HOJE === PAGINA ? [PAGINA] : [HOJE, PAGINA])) {
      const p = await abrir(b, url, vp);
      await p.evaluate(() => document.querySelectorAll('*').forEach(e => { e.style.transition = 'none'; }));
      await p.addScriptTag({ content: AXE });
      const r = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(v => ({ id: v.id, n: v.nodes.length, alvo: v.nodes.slice(0, 2).map(x => x.target.join(' ')).join(' | ') })));
      const ref = url === HOJE && HOJE !== PAGINA;
      const nome = ref ? 'página anterior' : 'página nova';
      res(`acessibilidade WCAG AA ${nome} ${vp[0]}px`, ref ? null : r.length === 0, r.length ? r.map(v => `${v.id} (${v.n}): ${v.alvo}`).join(' ; ') : 'axe-core: 0 violações');
      await p.close();
    }
  }

  // 9b. Âncoras levam ao destino; nada pesado tocando sozinho
  {
    const p = await abrir(b, PAGINA, [390, 844]);
    const quebradas = await p.evaluate(() => [...document.querySelectorAll('a[href*="#"]')]
      .map(a => new URL(a.getAttribute('href'), location.href))
      .filter(u => u.pathname === location.pathname && u.hash.length > 1 && !document.getElementById(decodeURIComponent(u.hash.slice(1))))
      .map(u => u.hash));
    res('toda âncora #id leva a um elemento que existe', quebradas.length === 0, quebradas.length ? `sem destino: ${[...new Set(quebradas)].join(', ')}` : 'âncoras da própria página conferidas');
    await p.waitForTimeout(1500);
    const peso = await p.evaluate(() => {
      const recursos = performance.getEntriesByType('resource').map(r => ({ nome: r.name.split('?')[0].split('/').pop(), kb: Math.round((r.transferSize || r.encodedBodySize || 0) / 1024), tipo: r.initiatorType }));
      const videos = [...document.querySelectorAll('video')].filter(v => v.autoplay || !v.paused).map(v => (v.currentSrc || v.src || '').split('/').pop());
      return { recursos, videos, total: recursos.reduce((t, r) => t + r.kb, 0) };
    });
    const grandes = peso.recursos.filter(r => r.kb > 1536 || (r.tipo === 'video' && r.kb > 1024));
    res('nenhum arquivo acima de 1,5 MB nem vídeo pesado tocando sozinho', grandes.length === 0 && peso.videos.every(v => !peso.recursos.find(r => r.nome === v && r.kb > 1024)),
      `${peso.recursos.length} arquivos, ${peso.total} KB no total${grandes.length ? '; grandes: ' + grandes.map(r => r.nome + ' ' + r.kb + ' KB').join(', ') : ''}${peso.videos.length ? '; vídeo automático: ' + peso.videos.join(', ') : ''}`);
    await p.close();
  }

  // 10. Computador: oferta acima da dobra
  {
    const p = await abrir(b, PAGINA, [1280, 800]);
    const rs = await rects(p, HERO);
    const fora = rs.filter(r => !r || r.bottom > 800).map(r => r ? r.s : 'ausente');
    res('computador 1280x800: oferta inteira sem rolar', fora.length === 0, fora.length ? `fora: ${fora.join(', ')}` : 'título, texto, capa, números, preço e botão acima de 800px');
    await p.close();
  }

  res('preço ao vivo da API = preço da página (o checkout cobra o da tabela)', null, 'conferir no admin ou na API de produção; daqui só o repositório é visível');
  res('números conferidos contra o PDF entregue', null, 'o PDF fica no Storage, fora do repositório; conferido só contra o texto já publicado');
  res('pagamento real no checkout', null, 'exige Mercado Pago em produção; só a navegação até o checkout foi testada');

  await b.close();
  fs.writeFileSync(path.join(out, 'prova.json'), JSON.stringify(R, null, 2));
  const f = R.filter(r => r.ok === false).length, n = R.filter(r => r.ok === null).length;
  console.log(`\n${R.length - f - n} passaram, ${f} falharam, ${n} não conferidos`);
})();
