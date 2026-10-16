# Mapa técnico atual — site 3trevo.com.br

Entrega 1 da auditoria. Descreve o que existe no repositório hoje, com caminhos verificáveis. Os achados estão em `REGISTRO_DE_ACHADOS.md`.

## 1. Repositório e publicação

| Item | Valor | Fonte |
|---|---|---|
| Repositório | `alkbhal/3trevo` | `git remote` |
| Branch de trabalho | `ccr-4e513a0b-ismtig` (sem PR de merge para `main` ainda) | `git status` |
| Tipo | Site **estático** (HTML + CSS + JS puro), sem framework e sem build | ausência de `package.json` na raiz |
| Publicação | GitHub Pages, domínio `3trevo.com.br` | `CNAME` |
| Backend | Cloudflare Worker `tres-trevo-api` (`worker/`), TypeScript, Vitest | `worker/wrangler.toml` |
| Banco | Supabase (Postgres) | `supabase/*.sql`, `js/supabase-client.js` |
| Instruções do projeto | `CLAUDE.md` (regra R-SEG-01: segurança primeiro) e `README.md` | raiz |

**Checagens automáticas (CI, `.github/workflows/ci.yml`):** verificação de hashes de cache (`scripts/stamp.mjs --check`) e, no `worker/`, `tsc` e Vitest. **Não há nenhum teste automatizado de interface.** Os testes existentes cobrem só o worker (110 casos).

## 2. Stack de interface

- **Linguagem:** HTML5, CSS3 (variáveis em `:root`), JavaScript sem módulos (scripts globais).
- **Sem framework:** renderização por `innerHTML` e template strings (por exemplo `renderProdutos` em `index.html`).
- **Estilo:** CSS embutido em cada página (`<style>` no próprio HTML). Não há arquivo de tokens compartilhado; cada página define suas variáveis.
- **Fontes:** Google Fonts (Fraunces, Instrument Sans na página inicial; Lora e Poppins na área do cliente). Carregadas por `<link rel="stylesheet">` no `<head>`, o que bloqueia a renderização.
- **Estado:** variáveis globais (`langAtual`, `prodCache`, `filtroAtual`) e `localStorage`/`sessionStorage` para sessão e preferências.
- **Roteamento:** páginas separadas (`index.html`, `catalogo.html`, `checkout.html?slug=…`, `obra/*.html`, `nema.html`, `area-cliente.html`, `minha-biblioteca.html`). Não há roteador de JavaScript. Navegação é por link de página.
- **Dados:** `js/tt-client.js` chama `GET /api/public/catalogo` (Worker) com cache de 5 min no cabeçalho. A página inicial chama essa função ao carregar, sem cache local.
- **Idiomas:** dicionário `LANG` em `index.html` (pt, en, es). Catálogo por idioma no servidor desde a entrega de publicação por idioma (`?idioma=`).
- **Imagens:** capas do catálogo entram como `background-image` em `style` inline (não são `<img>`). A página inicial não tem nenhum `<img>` no carregamento. As cenas da abertura são JPEG (`assets/abertura/cena-1..5.jpg`, cerca de 197 KB no total).
- **Vídeo:** `assets/hero-reel.mp4`, 7,48 MB, 10,02 s, em loop, `preload="none"`, mas tocado por `v.load(); v.play()` no evento `load` (`index.html`, linha 556).
- **Rastreamento:** `js/beacon.js` (eventos para `POST /api/track`), Google tag (`G-Q64TDCCL85`), pixel do Facebook.

## 3. Páginas e componentes

### 3.1 Página inicial — `index.html` (1496 linhas)

Ordem de cima para baixo (ids reais):

| Seção / componente | Id ou seletor | Função | Movimento |
|---|---|---|---|
| Cabeçalho fixo | `#hdr` | Logo, links (Catálogo, Nema, FAQ, Sobre, Minha Biblioteca), idioma PT/EN/ES, botão "Menu" | Encolhe ao rolar (`scrolled`, evento `scroll`) |
| Herói | `#inicio`, `#hero-video`, `.hero-video-bg` | Vídeo de fundo e chamada | Vídeo em loop; `livro-float` e `mini-float` (keyframes) |
| Abertura do próximo lançamento | `#abertura`, `.ab-cena` (5 cenas) | Câmera que percorre cinco cenas conforme a rolagem | Script de câmera com `requestAnimationFrame` (desativado com movimento reduzido) |
| Catálogo | `#catalogo`, `#prod-grid`, `.fbtn` | Filtros por categoria e cartões de livro | `.fi` e `.pcard` entram por `IntersectionObserver`; hover em CSS |
| Nema | `#nema`, `[data-k]` | Explicação do programa de fidelidade | Entrada em sequência `nemaEntra`, disparada por `IntersectionObserver` |
| Perguntas frequentes | `#faq`, `#faq-lista`, `[data-ent]` | Acordeão (`toggleFaq`) | Revelação por rolagem guiada (ver §4.3) |
| Sobre | `#sobre`, `[data-ent]` | Texto institucional | Revelação por rolagem guiada |
| Rodapé | `footer[data-ent="foot"]` | Links e direitos | Expansão com `clip-path` (ver §4.3) |
| WhatsApp | `#waBtn` | Atalho de atendimento | Não medido |

Modais: **a página inicial não tem modal.** Notificações: não há.

### 3.2 Catálogo — `catalogo.html` (462 linhas)

- Cabeçalho com menu móvel (`#menuBtn`, `#navMobile`, `aria-expanded`). Medido: funciona com toque e Escape.
- Grade `#gridEbooks` renderizada por `TTClient.getCatalogo()`; estados de carregamento, vazio, erro e nova tentativa (`tt-client.js`, `renderCatalogo`).
- Filtros por gênero (`.filtro`). Cartões são `<article data-genero>`.

### 3.3 Checkout — `checkout.html` (391 linhas)

- Lê `?slug=` e carrega o produto da API (`catalogo?slug=…`).
- Botão "Pagar com PIX ou Cartão" (Mercado Pago). Bloco de Nema aparece só com sessão e saldo (`carregarNemaCheckout`).
- Sem erro de página no teste de celular (com a API simulada).

### 3.4 Nema — `nema.html` (95 linhas)

Página de regras. Sem script de movimento. Sem erros de acessibilidade pelo axe.

### 3.5 Área do cliente — `area-cliente.html` (1893 linhas)

- Login por e-mail (Supabase Auth, link mágico e senha).
- Painel com abas: Início, Músicas, Clássicos, Clube TT, Conta.
- Leitor de EPUB: `js/leitor-tt.js`, compartilhado com a Minha Biblioteca.
- Trilhas: `js/player.js` (player fixo, `window.TTPlayer`).
- Lógica do painel: `js/area-cliente-painel.js`.

### 3.6 Minha Biblioteca — `minha-biblioteca.html` (575 linhas)

- Biblioteca Clássica por slots (até 3 leituras abertas), com leitor compartilhado.
- Modais de confirmação ("Concluir leitura?", "Adicionar à leitura"), com `fecharModal` ao clicar fora.

### 3.7 Obras — `obra/antifalencia.html`, `obra/justicamento.html`

Páginas de venda por título. `obra/atico.html` e `obra/terceiraguerra.html` têm 1 linha cada (redirecionamento ou placeholder; não analisado em detalhe).

## 4. Mecanismos de movimento e de navegação vertical

### 4.1 Rolagem

- A rolagem vertical é **a do próprio documento**. Não há contêiner com `overflow`, nem `scroll-snap`, nem carrossel horizontal na página inicial. O único `overflow-x` relevante é `hidden` no `body` e `clip` em `#nema`, `#faq` e `#sobre`.
- O cabeçalho encolhe ao rolar. Não há menu de navegação lateral.
- `html { scroll-behavior: smooth }` está em `index.html` (linha 47), `catalogo.html` e `area-cliente.html`. Isso faz qualquer `scrollTo` programático ser animado, e por isso testes com `scrollTo` repetido não andam direito (ver nota de método em `evidencias/`).

### 4.2 Abertura por câmera (`#abertura`)

Script de câmera (`index.html`, bloco "Abertura do próximo lançamento"):
- Cinco cenas sobrepostas, com opacidade e transformação calculadas por quadro a partir da posição da rolagem.
- Interpolação de Hermite nos pontos de câmera; suavização exponencial da rolagem (`atual += (alvo - atual) * …`).
- Desativado com `prefers-reduced-motion` (classe `ab-andar` não é adicionada, as cenas ficam empilhadas e legíveis).
- Escreve estilo em `fundos[i]`, `c`, `textos[i]` e `brilho` a cada quadro enquanto a seção estiver em movimento.

### 4.3 Rolagem guiada (`[data-ent]`)

Script "Rolagem guiada" (`index.html`, bloco seguinte):
- Ativa a classe `ent-on` em `<html>` **somente sem** `prefers-reduced-motion`.
- Com `ent-on`, o CSS esconde os blocos (`opacity: var(--p)`, `--p: 0`) e os desloca conforme `--p`. Blocos `l` e `r` usam `filter: blur(...)`; o rodapé usa `clip-path`.
- A cada quadro, `alvos()` lê `getBoundingClientRect()` de todos os `[data-ent]` e `quadro()` escreve `--p` em cada um.
- `pedir()` reinicia o laço em cada evento de `scroll`, `resize`, `load` e mutação de `#faq-lista`.
- **Ponto de atenção (F-01):** o reinício usa `ultimo = 0`, e o primeiro quadro calcula intervalo zero. A causa provável e o comportamento medido estão no registro.

### 4.4 Entrada do Nema

- `IntersectionObserver` adiciona `nema-go` uma vez (`rootMargin: 0 0 -22% 0`). Sem movimento reduzido, a animação `nemaEntra` e a luz `nemaLuz` rodam uma vez.
- Medido: 8 de 8 blocos `[data-k]` com opacidade 1 ao fim da rolagem.

### 4.5 Animações por keyframes (não dependem de JavaScript)

`livro-float`, `sc-bob`, `mini-float`, `badge-shine`, `pulse-dot`, `nemaEntra`, `nemaLuz` em `index.html`, mais `shimmer` (esqueleto) e `fadeUp` na área do cliente. Verificado por busca: `index.html` não tem nenhum `@media (prefers-reduced-motion)`; a preferência só é lida em JavaScript (linhas 1324 e 1445). Logo, esses keyframes rodam com a preferência ativa.

## 5. Carregamento

| Estado | Como aparece | Fonte |
|---|---|---|
| Página | HTML estático; CSS embutido; fontes do Google bloqueiam a renderização | `index.html` linhas 25–28 |
| Catálogo | Texto "Carregando catálogo…" no grid, sem esqueleto | `index.html`, `DOMContentLoaded` |
| Falha do catálogo | Texto "Não foi possível carregar o catálogo agora…", **sem botão** | medido (F-09) |
| Capas | `background-image` inline, sem `loading="lazy"` | `renderProdutos` |
| Vídeo | Baixado e tocado no `load` | `index.html` linha 556 |
| Abertura | 5 JPEG pré-carregados no início | `index.html`, bloco da abertura |
| Checkout | Produto carregado da API; bloco de Nema só com sessão | `checkout.html` |

## 6. Efeitos de hover e foco

- 12 regras `:hover` em `index.html`. Não foram medidas individualmente.
- Foco: só `.ab-pular:focus-visible` tem estilo explícito. Os demais dependem do navegador, e nove controles não mostram contorno (F-07).

## 7. Responsividade

- `index.html` tem `@media` em 620, 768, 900 (min-width) e 960 px, além de 17 usos de unidades `vw`/`vh`/`svh` e 6 de `clamp()`. `vw < 900` também aparece em JavaScript, na abertura. A área do cliente usa 960, 600 e 380 px.
- Sem rolagem horizontal indesejada em 375 px e 1280 px (medido em todas as páginas da lista).

## 8. Fontes de verdade (onde mexer)

| Assunto | Arquivo |
|---|---|
| Layout e estilo da página inicial | `index.html` (`<style>` do topo) |
| Movimento da abertura | `index.html`, bloco "Abertura do próximo lançamento" |
| Movimento da rolagem guiada | `index.html`, bloco "Rolagem guiada" |
| Cliente de catálogo | `js/tt-client.js` |
| Leitor de livros | `js/leitor-tt.js` |
| Painel da área do cliente | `js/area-cliente-painel.js`, `area-cliente.html` |
| Player de música | `js/player.js` |
| Rastreamento | `js/beacon.js` |
| Regras de negócio e API | `worker/src/**` |
| Testes | `worker/tests/**` (somente backend) |

## 9. Limites desta análise

- Não foi executado Lighthouse nem teste em aparelho real (ver `PLANO_DE_MEDICAO_PERFORMANCE.md`).
- Os CDNs externos foram bloqueados no laboratório; por isso a fonte, o gtag e o Supabase não representam a carga real.
- A API foi simulada com um catálogo fixo de três livros.
