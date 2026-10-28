"""Gera a página de obra no padrão B+C clean a partir da página antiga (molde anterior).

Uso (da raiz do repo):
  python3 .claude/skills/pagina-de-obra/arquivos/gerar-pagina-obra.py \
      .claude/skills/pagina-de-obra/arquivos/obras/<slug>.json obra/<slug>.html

O JSON traz: slug, promessa (1 a 3 frases do topo), resto (o restante da sinopse,
que desce para abrir "O que você vai ler"), ficha ([["15", "capítulos"], ...] — só números
que estão no texto e no livro) e, opcional, origem (caminho da página antiga; padrão:
obra/<slug>.html). Preço, capa, textos, links e JSON-LD saem da página antiga, sem mudança.
O script falha se a página não tiver a estrutura do molde anterior: nesse caso, ajustar à mão.
Conferido: reproduz byte a byte a página de Livre das Dívidas aprovada em 27/10/2026.
"""
import pathlib, sys

import json
cfg = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
SLUG = cfg['slug']
orig = pathlib.Path(cfg.get('origem') or f'/home/user/3trevo/obra/{SLUG}.html').read_text(encoding='utf-8')
out = pathlib.Path(sys.argv[2])

def troca(s, a, b):
    assert s.count(a) == 1, (a[:70], s.count(a))
    return s.replace(a, b)

FONTES_ORIG = 'family=Lora:ital,wght@0,400;0,600;1,400;1,600&family=Poppins:wght@300;400;500;600'
FONTES = 'family=Playfair+Display:wght@600;700&family=Lora:ital,wght@0,400;0,600;1,400&family=Poppins:wght@300;400;500;600'
WA = orig.split('<a id="waBtn" href="', 1)[1].split('"', 1)[0]
WA_SVG = orig.split('<a id="waBtn"', 1)[1].split('<svg', 1)[1].split('</svg>', 1)[0]

PROMESSA = cfg['promessa']
RESTO = cfg['resto']

CSS = """
/* ── B+C clean ─────────────────────────────────────────────────────────────
   Identidade: verde da marca + dourado. Leis de UX aplicadas:
   Hick (uma decisão por tela), Von Restorff (só o botão de compra é dourado cheio),
   Fitts (botão grande e perto do polegar), Proximidade (preço colado no botão),
   Miller (a oferta em 4 blocos), Jakob (capa à esquerda, como nas livrarias online),
   Estética-usabilidade (menos bordas, menos rótulos em caixa alta, mais respiro). */
:root{--verde-nav:#1e3528;--verde:#2c4a38;--ouro-claro:#d6b762;--papel:#faf7f0}
body::before{display:none}
.divisor{display:none}
nav,nav.scrolled{background:#1e3528}
.nav-cta{background:transparent;color:var(--ouro-claro);border:1px solid rgba(214,183,98,.6)}
.nav-cta:hover{background:rgba(214,183,98,.12)}

.obra-hero{background:radial-gradient(110% 90% at 30% 0%,#33503f 0%,#24392d 55%,#1c2d23 100%);border-bottom:0;min-height:0;padding:128px 48px 96px}
.obra-hero-inner{grid-template-columns:300px 1fr;gap:72px;max-width:1080px}
.obra-mockup-grande{order:-1;width:260px!important;height:390px!important;margin:0 auto}
.obra-mockup-grande img{width:260px!important;height:390px!important;border-radius:2px;box-shadow:0 0 0 1px rgba(246,241,230,.28),0 30px 60px -20px rgba(0,0,0,.55),0 0 80px rgba(214,183,98,.14)!important}
.obra-mockup-grande:hover{transform:none}
.obra-breadcrumb{text-transform:none;letter-spacing:.2px;font-size:12px;color:rgba(244,239,229,.5);margin-bottom:28px}
.obra-breadcrumb::before{display:none}
.obra-breadcrumb a{color:rgba(244,239,229,.7)}
.obra-genero{color:var(--ouro-claro);letter-spacing:2.5px;font-size:11px;margin-bottom:18px}.obra-genero::before{display:none}
h1.obra-titulo,h2.sec-titulo,.programa-titulo,.obra-preco,.ficha b{font-family:'Playfair Display',serif}
h1.obra-titulo{color:#f6f1e6;font-weight:700;font-size:clamp(44px,5.2vw,68px);line-height:1;letter-spacing:-.5px;margin-bottom:14px}
.obra-autor{color:rgba(244,239,229,.62);font-size:14px;letter-spacing:.3px;margin-bottom:22px}
.obra-desc{font-family:'Lora',serif;font-style:italic;color:rgba(246,241,230,.92);font-size:21px;line-height:1.45;margin-bottom:32px}
.ficha{list-style:none;display:grid;grid-template-columns:repeat(3,auto);justify-content:start;gap:0;margin:0 0 32px;padding:0}
.ficha li{padding:0 28px;border-left:1px solid rgba(244,239,229,.16);font-size:12px;line-height:1.35;color:rgba(244,239,229,.68)}
.ficha li:first-child{padding-left:0;border-left:0}
.ficha b{display:block;font-size:28px;font-weight:600;color:#f6f1e6;line-height:1.1}
.compra-linha{display:flex;align-items:center;gap:28px;flex-wrap:wrap}
.obra-preco-badge{background:none;border:0;padding:0;margin:0;display:block}
.obra-preco{color:#f6f1e6;font-size:36px;font-weight:600;line-height:1}
.obra-faixa{color:rgba(244,239,229,.6);letter-spacing:1.5px;font-size:10px;margin-bottom:6px}
.obra-cotas{color:rgba(244,239,229,.6);font-size:12px;margin-top:6px}
.btn-adquirir{background:var(--ouro-claro);color:#1c2d23;font-weight:600;font-size:16px;border-radius:8px;padding:18px 36px;letter-spacing:.2px}
.btn-adquirir:hover{background:#e2c675}
.obra-hero a:focus-visible,.compra-fixa a:focus-visible{outline-color:var(--ouro-claro)}

/* corpo: papel claro, leitura confortável, sem molduras */
.obra-content{background:var(--papel);padding:96px 48px}
.obra-content-inner{max-width:1080px;gap:80px}
.obra-texto{max-width:640px}
.obra-lead{font-family:'Lora',serif;font-size:21px;line-height:1.55;color:var(--tinta);margin-bottom:28px}
.obra-texto p{font-size:16px;line-height:1.8}
.sec-label::before{display:none}.sec-label{letter-spacing:3px}
.sidebar-card{background:transparent;border:0;border-top:1px solid var(--borda);padding:24px 0;margin:0}
.sidebar-card::before{display:none}
.autor-info a{text-decoration:underline;text-underline-offset:3px}
.obra-lista li::before{content:'—';font-size:14px;margin-top:0}

/* Nema em papel, não em mais um bloco verde */
.obra-programa{background:#f1ece0;padding:72px 48px}
.cotas-badge{background:transparent;border:0;padding:0;color:var(--ouro-texto);font-size:30px;margin-bottom:12px}
.cotas-badge span{opacity:1;color:var(--ouro-texto)}
.programa-titulo{color:var(--tinta)}.programa-desc{color:var(--tinta2);margin-bottom:28px}
.btn-programa{color:var(--ouro-texto);border-color:rgba(122,92,30,.45)}
.obra-outros{background:var(--papel)}

/* rodapé grafite, legível */
footer{background:#1b1d1b}
.footer-desc{color:rgba(255,255,255,.7)}
.footer-grid>div:first-child>div:last-child{color:rgba(255,255,255,.62)!important}
.footer-col h4{color:rgba(255,255,255,.62)}
.footer-col a,.footer-contato{color:rgba(255,255,255,.75)}
.footer-legal{color:rgba(255,255,255,.6)}
.footer-selo{color:rgba(214,183,98,.85);border-color:rgba(214,183,98,.4)}
@media(min-width:901px){.footer-bottom{padding-right:84px}}
.compra-fixa-wa{display:none}

@media(max-width:900px){
 .obra-hero{padding:80px 20px 32px}
 .obra-hero-inner{grid-template-columns:112px 1fr;grid-template-areas:"crumb crumb" "capa gen" "capa h1" "capa autor" "desc desc" "ficha ficha" "compra compra";column-gap:18px;row-gap:0;align-items:end}
 .obra-hero-inner>div:first-child{display:contents}
 .obra-breadcrumb{grid-area:crumb;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:11px;margin-bottom:16px}
 .obra-genero{grid-area:gen;font-size:10px;letter-spacing:2px;margin-bottom:8px}
 h1.obra-titulo{grid-area:h1;font-size:34px;margin-bottom:6px}
 .obra-autor{grid-area:autor;font-size:12px;margin-bottom:0;align-self:start}
 .obra-mockup-grande{grid-area:capa;width:112px!important;height:168px!important;margin:0;align-self:center}
 .obra-mockup-grande img{width:112px!important;height:168px!important}
 .obra-desc{grid-area:desc;font-size:18px;margin:20px 0 18px}
 .ficha{grid-area:ficha;grid-template-columns:repeat(3,1fr);margin-bottom:20px}
 .ficha li{padding:0 10px}.ficha b{font-size:24px}
 .compra-linha{grid-area:compra;flex-wrap:nowrap;gap:16px}
 .obra-preco{font-size:30px}.obra-faixa{font-size:9px;white-space:nowrap}
 .obra-cotas{display:none}
 .obra-acoes{flex:1 1 auto;display:flex}
 .btn-adquirir{width:100%;justify-content:center;padding:16px 12px}
 .obra-content{padding:56px 20px}
 .obra-lead{font-size:19px}
 .obra-programa{padding:56px 20px}
 /* WhatsApp sai de cima do texto e vai para a barra fixa */
 #waBtn{display:none}
 .compra-fixa{background:#1e3528;transform:translateY(110%);transition:transform .25s ease}
 .compra-fixa.visivel{transform:none}
 .compra-fixa-preco{color:#f6f1e6!important}
 .compra-fixa .compra-fixa-wa{display:flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:50%;background:var(--verde);flex-shrink:0;padding:0!important}
 .compra-fixa-wa svg{width:22px;height:22px}
 .compra-fixa-acoes{display:flex;align-items:center;gap:10px}
 .compra-fixa .compra-fixa-comprar{background:var(--ouro-claro);color:#1c2d23;border-radius:8px}
}
@media(max-width:900px) and (max-height:700px){
 .obra-hero{padding-top:68px}
 .obra-breadcrumb{display:none}
 .obra-hero-inner{grid-template-columns:92px 1fr}
 .obra-mockup-grande{width:92px!important;height:138px!important}
 .obra-mockup-grande img{width:92px!important;height:138px!important}
 h1.obra-titulo{font-size:30px}
 .obra-desc{font-size:17px;margin:14px 0 12px}
 .ficha{margin-bottom:14px}.ficha b{font-size:21px}
}
@media(prefers-reduced-motion:reduce){.compra-fixa{transition:none}}
"""

JS_BARRA = """
  (function(){var barra=document.querySelector('.compra-fixa'),alvo=document.querySelector('.obra-acoes');
    if(!barra||!alvo||!('IntersectionObserver' in window)){if(barra)barra.classList.add('visivel');return;}
    new IntersectionObserver(function(es){barra.classList.toggle('visivel',!es[0].isIntersecting);}).observe(alvo);})();
"""
PRECO = orig.split('<span class="compra-fixa-preco">', 1)[1].split('<', 1)[0]
BARRA_ORIG = f'<div class="compra-fixa" aria-label="Comprar"><span class="compra-fixa-preco">{PRECO}</span><a href="/checkout.html?slug={SLUG}">Adquirir agora →</a></div>'
BARRA = ('<div class="compra-fixa" aria-label="Comprar"><span class="compra-fixa-preco">' + PRECO + '</span>'
         '<span class="compra-fixa-acoes"><a class="compra-fixa-wa" href="' + WA + '" target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp">'
         '<svg' + WA_SVG + '</svg></a>'
         '<a class="compra-fixa-comprar" href="/checkout.html?slug=' + SLUG + '">Adquirir agora →</a></span></div>')

h = orig
h = troca(h, FONTES_ORIG, FONTES)
h = troca(h, '</style>', CSS + '</style>')
h = troca(h, PROMESSA + ' ' + RESTO + '</p>', PROMESSA + '</p>')
h = troca(h, '<div class="obra-texto">\n', '<div class="obra-texto">\n        <p class="obra-lead">' + RESTO + '</p>\n')
# Números do produto: todos saem do texto já publicado (Detalhes do ebook e O que você vai ler).
h = troca(h, '      <div class="obra-preco-badge',
          '      <ul class="ficha" aria-label="O que você leva">' + ''.join(f'<li><b>{n}</b> {r}</li>' for n, r in cfg['ficha']) + '</ul>\n'
          '      <div class="compra-linha">\n      <div class="obra-preco-badge')
h = troca(h, '\n        <a href="/catalogo.html" class="btn-catalogo">← Ver catálogo</a>\n      </div>', '\n      </div>\n      </div>')
h = troca(h, 'Rende Nema (N$),<br>a moeda da editora', 'Rende Nema (N$), a moeda da editora')
h = troca(h, BARRA_ORIG, BARRA)
h = troca(h, "  setTimeout(function(){document.querySelectorAll('.obra-hero .reveal')", JS_BARRA + "  setTimeout(function(){document.querySelectorAll('.obra-hero .reveal')")
out.write_text(h, encoding='utf-8')
print(SLUG, 'ok')
