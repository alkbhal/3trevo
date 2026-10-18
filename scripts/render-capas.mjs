#!/usr/bin/env node
// scripts/render-capas.mjs — renderiza capas por código (HTML → PNG 1600×2560).
// Uso: node scripts/render-capas.mjs <pasta-saida> [slug ...]
//
// Capas "referencia": obras em domínio público, compostas a partir dos dados da
// página de rosto (título, autor, ano, editora). Não são cópias da capa histórica.
// Cada uma gera também um verso com a ficha técnica (editora, fontes, licença e
// aviso de IA). A capa da frente nunca recebe a identidade da editora.
// Capas "editora": produto próprio da Três Trevo (Almanaque semanal), numerado.

import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const LARGURA = 1600;
const ALTURA = 2560;
const CHROMIUM = process.env.CHROMIUM_BIN ?? 'chromium';

// Campos:
// - ano: ano da primeira edição (página de rosto).
// - editora: editora histórica, só se confirmada na página de rosto; vazio = a linha não aparece.
// - falecimento: ano da morte do autor, usado para o cálculo do domínio público (Lei 9.610/1998, art. 41).
// - fonteDados: onde a informação foi conferida.
// - fonteImagem / licencaImagem: null = pendente, até a imagem histórica ser enviada e verificada.
// - ia: null = nenhuma ferramenta de IA foi usada; texto = descrição exata do uso, que vai no aviso.
const TITULOS = [
  {
    slug: 'dom-casmurro', titulo: 'Dom Casmurro', autor: 'Machado de Assis', ano: '1899',
    editora: 'B. L. Garnier, Livreiro-Editor', falecimento: 1908,
    fonteDados: 'Project Gutenberg #55752, página de rosto da edição de 1899',
    fonteImagem: null, licencaImagem: null, ia: null,
  },
  {
    slug: 'iracema', titulo: 'Iracema', subtitulo: 'Lenda do Ceará', autor: 'José de Alencar', ano: '1865',
    editora: '', falecimento: 1877,
    fonteDados: 'Catálogos consultados; editora da primeira edição não confirmada na página de rosto',
    fonteImagem: null, licencaImagem: null, ia: null,
  },
  {
    slug: 'memorias-postumas', titulo: 'Memórias Póstumas de Brás Cubas', autor: 'Machado de Assis', ano: '1881',
    editora: 'Typographia Nacional', falecimento: 1908,
    fonteDados: 'Project Gutenberg #54829, página de rosto da edição de 1881',
    fonteImagem: null, licencaImagem: null, ia: null,
  },
  {
    slug: 'o-cortico', titulo: 'O Cortiço', autor: 'Aluísio Azevedo', ano: '1890',
    editora: '', falecimento: 1913,
    fonteDados: 'Data de publicação conferida em referência secundária; editora não confirmada',
    fonteImagem: null, licencaImagem: null, ia: null,
  },
  {
    slug: 'o-guarani', titulo: 'O Guarani', autor: 'José de Alencar', ano: '1857',
    editora: '', falecimento: 1877,
    fonteDados: 'Referência enciclopédica para a primeira edição de 1857; editora não confirmada',
    fonteImagem: null, licencaImagem: null, ia: null,
  },
  {
    slug: 'almanaque-tt', tipo: 'editora', titulo: 'Almanaque Três Trevo', autor: 'Editora Três Trevo',
    numero: '001/26', edicao: 'Edição semanal',
    // Pauta da semana. Texto editorial, escrito pela equipe; não é copiado de outra fonte.
    manchete: 'Eleições Presidenciais: a nova Copa do Mundo, ou só a novela de folhetim?',
    chamada: 'Entre a torcida e o enredo, quem escreve o roteiro desta eleição?',
    // Ilustração por edição: caminho absoluto do arquivo em alta resolução, passado por variável de ambiente.
    // Sem ela, a capa usa só a arte em SVG de segundo plano.
    ilustracao: process.env.ALMANAQUE_ILUSTRACAO ?? null,
    iaIlustracao: 'Ilustração de capa gerada com auxílio de inteligência artificial, a partir da manchete da semana.',
  },
];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const base = `html,body{margin:0;width:${LARGURA}px;height:${ALTURA}px;overflow:hidden}
.moldura{position:absolute;inset:90px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center}`;

function capaReferencia(l) {
  const sub = l.subtitulo ? `<div class="sub">${esc(l.subtitulo)}</div>` : '';
  const editora = l.editora ? `<div class="rodape">${esc(l.editora)}</div>` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${base}
body{background:#efe6d2;font-family:Georgia,'Liberation Serif','DejaVu Serif',serif;color:#2a2418}
.moldura{border:3px double #5a4a2c;padding:150px 120px 130px}
.selo{font-size:34px;letter-spacing:8px;text-transform:uppercase;color:#6b5a34}
.titulo{font-size:150px;line-height:1.05;letter-spacing:2px}
.sub{font-style:italic;font-size:64px;margin-top:40px}
.filete{width:300px;height:4px;background:#8a6d32;margin:70px auto}
.autor{font-size:88px;letter-spacing:6px;text-transform:uppercase}
.ano{font-size:72px;margin-bottom:30px}
.rodape{font-size:44px;line-height:1.6}</style></head><body><div class="moldura">
<div class="selo">Edição de referência</div>
<div><div class="titulo">${esc(l.titulo)}</div>${sub}<div class="filete"></div></div>
<div class="autor">${esc(l.autor)}</div>
<div><div class="ano">${esc(l.ano)}</div>${editora}</div>
</div></body></html>`;
}

// Ficha técnica no verso. Só traz o que foi conferido; o que falta aparece como "pendente".
function capaVerso(l) {
  const linhas = [
    ['Obra', `${l.titulo}${l.subtitulo ? `: ${l.subtitulo}` : ''}`],
    ['Autor', l.autor],
    ['Primeira edição', [l.ano, l.editora].filter(Boolean).join(' · ')],
    ['Esta edição', 'Editora Três Trevo'],
    ['Domínio público', `Autor falecido em ${l.falecimento}. Direitos patrimoniais encerrados ao fim de ${l.falecimento + 70} (Lei 9.610/1998, art. 41). Em domínio público desde 1º/1/${l.falecimento + 71}.`],
    ['Fonte dos dados', l.fonteDados],
    ['Fonte da imagem', l.fonteImagem ?? 'pendente'],
    ['Licença da imagem', l.licencaImagem ?? 'pendente'],
  ];
  const aviso = l.ia ? `<div class="aviso">Imagem restaurada com auxílio de inteligência artificial: ${esc(l.ia)}</div>` : '';
  const itens = linhas.map(([k, v]) => `<div class="item"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${base}
body{background:#efe6d2;font-family:Georgia,'Liberation Serif','DejaVu Serif',serif;color:#2a2418}
.moldura{border:3px double #5a4a2c;padding:140px 120px 130px;justify-content:flex-start;text-align:left}
.cab{font-size:34px;letter-spacing:8px;text-transform:uppercase;color:#6b5a34;text-align:center;width:100%}
.lista{width:100%;margin-top:110px}
.item{display:flex;gap:40px;padding:34px 0;border-bottom:2px solid #c9b88f}
.k{flex:0 0 420px;font-size:40px;letter-spacing:3px;text-transform:uppercase;color:#6b5a34}
.v{flex:1;font-size:44px;line-height:1.4}
.aviso{margin-top:70px;padding:40px;border:2px solid #8a6d32;font-size:42px;line-height:1.5;width:100%;box-sizing:border-box}
.rodape{margin-top:auto;font-size:44px;letter-spacing:4px;color:#2a2418;text-align:center;width:100%}</style></head><body><div class="moldura">
<div class="cab">Ficha técnica</div>
<div class="lista">${itens}</div>
${aviso}
<div class="rodape">✦ Editora Três Trevo</div>
</div></body></html>`;
}

// Capa do periódico: a manchete da semana é o elemento principal.
function capaEditora(l) {
  const ilust = l.ilustracao ? `<img class="ilust" src="file://${l.ilustracao}"><div class="veu"></div>` : '';
  const aviso = l.iaIlustracao && l.ilustracao ? `<div class="aviso-ia">${esc(l.iaIlustracao)}</div>` : '';
  const chamada = l.chamada ? `<div class="chamada">${esc(l.chamada)}</div>` : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>${base}
body{background:#0f2d1a;font-family:Georgia,'Liberation Serif','DejaVu Serif',serif;color:#f7f2e6}
.moldura{border:2px solid rgba(200,168,75,.45);padding:130px 120px 130px;justify-content:space-between;text-align:left}
.arte{position:absolute;left:160px;top:900px;width:1280px;opacity:.07}
.ilust{position:absolute;left:0;top:0;width:${LARGURA}px;height:${ALTURA}px;object-fit:cover}
.veu{position:absolute;left:0;top:0;width:${LARGURA}px;height:${ALTURA}px;background:linear-gradient(rgba(15,45,26,.55),rgba(15,45,26,.92))}
.aviso-ia{font-size:30px;line-height:1.4;color:#e6d59a;text-align:center;margin-top:30px;width:100%}
.topo{width:100%}
.selo{font-size:34px;letter-spacing:8px;text-transform:uppercase;color:#c8a84b;text-align:center}
.jornal{font-size:50px;letter-spacing:4px;color:#e6d59a;text-align:center;margin-top:50px}
.filete{width:100%;height:3px;background:#c8a84b;margin:40px 0 0}
.manchete{font-size:150px;line-height:1.06;font-weight:600;width:100%}
.chamada{font-size:56px;line-height:1.4;font-style:italic;color:#e6d59a;margin-top:60px;width:100%}
.rodape{width:100%}
.numero{font-size:72px;letter-spacing:4px;color:#f7f2e6;text-align:center}
.edicao{font-size:44px;letter-spacing:4px;color:#e6d59a;margin-top:20px;text-align:center}
.autor{font-size:44px;letter-spacing:8px;text-transform:uppercase;color:#c8a84b;text-align:center;margin-top:70px}</style></head><body>${ilust}<div class="moldura">
<svg class="arte" viewBox="0 0 1280 900" fill="none" stroke="#c8a84b" stroke-width="10" stroke-linejoin="round">
<rect x="340" y="420" width="600" height="380" rx="18"/>
<rect x="420" y="470" width="440" height="22" rx="11" fill="#c8a84b"/>
<circle cx="640" cy="260" r="130" stroke="#e6d59a"/>
<polygon points="640,200 697,241.5 675.3,308.5 604.7,308.5 582.9,241.5" stroke="#e6d59a" stroke-width="8"/>
<path d="M640 390 V420" stroke-dasharray="6 14" stroke-linecap="round"/>
<text x="640" y="880" text-anchor="middle" fill="#c8a84b" stroke="none" font-family="Georgia,'Liberation Serif',serif" font-style="italic" font-size="64">continua…</text>
</svg>
<div class="topo"><div class="selo">✦ Três Trevo</div><div class="jornal">${esc(l.titulo)}</div><div class="filete"></div></div>
<div class="manchete">${esc(l.manchete)}</div>
${chamada}
<div class="rodape"><div class="numero">Nº ${esc(l.numero)}</div><div class="edicao">${esc(l.edicao)}</div><div class="autor">${esc(l.autor)}</div></div>
${aviso}
</div></body></html>`;
}

function gravar(html, nome, saida) {
  const htmlPath = join(saida, `${nome}.html`);
  const pngPath = join(saida, `${nome}.png`);
  writeFileSync(htmlPath, html);
  execFileSync(
    CHROMIUM,
    ['--headless', '--no-sandbox', '--hide-scrollbars', `--window-size=${LARGURA},${ALTURA}`, `--screenshot=${pngPath}`, `file://${htmlPath}`],
    { stdio: 'ignore', timeout: 60000 },
  );
  return pngPath;
}

function renderizar(livro, saida) {
  if (livro.tipo === 'editora') return [gravar(capaEditora(livro), livro.slug, saida)];
  return [gravar(capaReferencia(livro), livro.slug, saida), gravar(capaVerso(livro), `${livro.slug}-verso`, saida)];
}

const [saidaArg, ...filtro] = process.argv.slice(2);
if (!saidaArg) {
  console.error('Uso: node scripts/render-capas.mjs <pasta-saida> [slug ...]');
  process.exit(1);
}
const saida = resolve(saidaArg);
mkdirSync(saida, { recursive: true });

const alvo = filtro.length ? TITULOS.filter((t) => filtro.includes(t.slug)) : TITULOS;
for (const livro of alvo) {
  for (const arquivo of renderizar(livro, saida)) console.log(arquivo);
}
