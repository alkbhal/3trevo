# Registro de achados — Editora Três Trevo (site público)

Data: 16/10/2026 · Escopo: front-end estático (`index.html`, `catalogo.html`, `checkout.html`, `nema.html`, `area-cliente.html`, `minha-biblioteca.html`, `js/`) · Nenhum arquivo de produção foi alterado.

**Classificação**
- **CONFIRMADO** — reproduzido em navegador ou verificado diretamente no código.
- **MELHORIA RECOMENDADA** — oportunidade real, sem defeito demonstrado.
- **PENDENTE DE TESTE** — hipótese que depende de aparelho, rede real ou ferramenta não executada.

**Prioridade** — P0 bloqueia compra ou acesso; P1 é problema relevante de navegação, conteúdo, acessibilidade ou desempenho; P2 melhoria importante; P3 refinamento.

**Ambiente:** Chromium headless com renderização por software, CDNs externos bloqueados, API simulada. Medições de quadros são indicativas, não representam aparelho real. Detalhes em `evidencias/medicoes.json`.

---

## Resumo

| Tipo | Quantidade |
|---|---|
| CONFIRMADO | 9 |
| MELHORIA RECOMENDADA | 6 |
| PENDENTE DE TESTE | 6 |
| Controles que funcionam (registrados para não serem mexidos) | 4 |

---

## CONFIRMADOS

### F-01 · Blocos da página inicial somem após um salto de rolagem
- **Componente:** rolagem guiada da página inicial (`index.html`, script "Rolagem guiada", elementos `[data-ent]`: perguntas frequentes, "Quem somos", rodapé).
- **Descrição:** ao chegar às perguntas frequentes por um salto (link de âncora "FAQ" do cabeçalho, `scrollTo`, ou um giro grande da roda), os blocos ficam com opacidade 0. Rolar depois não os revela. A revelação funciona quando a rolagem é contínua desde o topo.
- **Evidência:** `salto-ent` — 2 s após o link `#faq`, os 8 blocos de FAQ estão em opacidade 0; uma rolagem de 30 px não muda nada. `recupera` — após 3 s de rolagem da roda até o fim da página, continuam em 0. `percorre` — rolando desde o topo, cada item atinge opacidade 1,00 (roda 40 px/16 ms) e 0,98–0,99 (roda 120 px/60 ms).
- **Causa provável (não confirmada por instrumentação):** em `quadro()`, o primeiro quadro após cada reinício usa intervalo de tempo zero (`ultimo = 0` no `pedir()`), o passo de interpolação fica zero, nenhum bloco avança, e o laço para. O próximo evento de rolagem reinicia o ciclo. Confirmar com registro dentro da função antes de corrigir.
- **Impacto:** a FAQ contém as regras do Nema e as respostas sobre entrega. Quem chega por link do cabeçalho pode ver a seção vazia.
- **Gravidade:** alta. **Frequência provável:** média (depende de chegar por âncora ou por salto de rolagem).
- **Prioridade:** P1 (conteúdo oculto acessível por navegação normal). Sobe para P0 se a FAQ for considerada caminho obrigatório para compra.
- **Complexidade:** baixa a média. **Risco de regressão:** médio, o script é compartilhado com a abertura do Nema.
- **Critério de aceite:** após qualquer salto (âncora, `scrollTo`, giro grande), todos os `[data-ent]` chegam a opacidade 1 em até 1 s, e o teste `salto-ent` passa.
- **Validação:** repetir `salto-ent` e `percorre` em Chromium; depois em celular real.

### F-02 · Vídeo do herói baixa 7,5 MB e toca sozinho, sem controle de pausa
- **Componente:** `index.html`, `assets/hero-reel.mp4`, linha do `window.addEventListener('load', …)` que chama `v.load(); v.play()`.
- **Descrição:** o vídeo de 10,02 s é reproduzido em loop no carregamento, em qualquer conexão e tamanho de tela. A página não tem botão de pausa. O pedido ao arquivo acontece mesmo com "reduzir movimento" ativo (2 pedidos nos dois modos).
- **Evidência:** duração e tamanho lidos do próprio arquivo; `video` — pedidos do vídeo nos dois modos; DOM sem controle de pausa.
- **Critérios:** WCAG 2.2.2 (Pausar, parar, ocultar), nível A: conteúdo em movimento que começa sozinho, dura mais de 5 s e não tem mecanismo de pausa. A verificação de reprodução real fica como PENDENTE (ver P-02).
- **Impacto:** consumo de dados no celular; desconforto para quem pede movimento reduzido; falha de acessibilidade.
- **Prioridade:** P1.
- **Critério de aceite:** com "reduzir movimento", o vídeo não é baixado nem tocado; sem essa preferência, há botão visível de pausa; em conexão lenta (`navigator.connection`) não é baixado automaticamente.
- **Validação:** teste no aparelho com dados móveis, com e sem a preferência.

### F-03 · Rolagem com movimento padrão custa mais que sem movimento
- **Componente:** rolagem guiada e abertura por câmera (`index.html`).
- **Medição** (3 execuções cada, mesma rolagem de página inteira em passos de 120 px):

| | Padrão | Reduzido |
|---|---|---|
| Quadros acima de 20 ms (de ~330) | 38, 43, 44 | 1, 3, 1 |
| p95 do intervalo entre quadros | 33,4 ms | 16,8 ms |
| Recalcular estilo (contagem) | 456–466 | 235–251 |
| Script (ms) | 76–77 | 19–21 |

- **Interpretação:** o JavaScript é barato (cerca de 76 ms em toda a rolagem). O custo maior está em recalcular estilo e pintar: a cada quadro, os scripts escrevem propriedades em todos os blocos `[data-ent]`, na abertura e em `clip-path` e `filter: blur` do rodapé e das perguntas.
- **Limite:** renderização por software, sem GPU. Em aparelho real o número muda; a diferença relativa é o sinal. Confirmar em PENDENTE P-03.
- **Prioridade:** P1 (desempenho de navegação em página inicial).
- **Critério de aceite:** rolagem completa com movimento padrão tem quadros acima de 20 ms em no máximo 5% dos quadros, em aparelho de referência, sem aumentar o custo de estilo além de 1,3× o do modo reduzido.

### F-04 · `will-change` permanente em 27 elementos
- **Componente:** `index.html`, regra `.ent-on [data-ent] { will-change: transform, opacity }` e regras `.ab-*`.
- **Evidência:** medição no carregamento, antes de qualquer rolagem: 27 elementos com `will-change` diferente de `auto`. Além disso, cada capa do catálogo roda `mini-float` (animação infinita de 5 s) desde o carregamento.
- **Impacto:** cada elemento vira uma camada de composição mantida na memória do aparelho mesmo quando parado. Em celulares modestos, isso consome memória e pode atrasar a pintura.
- **Prioridade:** P2 (confirmado no número; o impacto no aparelho é PENDENTE P-03).
- **Critério de aceite:** `will-change` aplicado só durante a animação do elemento e removido ao fim; medido no carregamento, zero elementos parados com `will-change`.

### F-05 · Contraste insuficiente em texto pequeno do catálogo
- **Componente:** `catalogo.html`, cartões de livro (`.ebook-autor`, textos de suporte), e outros textos de baixo contraste.
- **Evidência:** axe-core (`color-contrast`, gravidade "serious", 20 nós). Razões medidas: 1,63:1 a 3,74:1, em textos de 10 a 13 px. Exemplo: `#9a9790` sobre `#ffffff`, 2,91:1; `#6a6b76` sobre `#06091a`, 3,74:1 (9 nós).
- **Critério WCAG:** 1.4.3 (contraste mínimo, nível AA) exige 4,5:1 para texto normal.
- **Prioridade:** P1 (acessibilidade, critério AA).
- **Critério de aceite:** axe sem violações de `color-contrast` nas páginas públicas; textos abaixo de 18 px com razão ≥ 4,5:1.

### F-06 · O botão "Menu" da página inicial não abre menu
- **Componente:** `index.html`, `<button class="menu-mob">` com `aria-label="Menu"`.
- **Código:** `onclick="document.getElementById('catalogo').scrollIntoView(...)"`. Não há painel de navegação nem `aria-expanded`.
- **Evidência:** ao tocar o botão em 375 px, a página rola de 0 para 1161 px (até o catálogo) e `aria-expanded` não existe. A página do catálogo tem um menu real (`#menuBtn`, `aria-expanded` alterna de `false` para `true` e volta a `false` com Escape). Esse comportamento está correto.
- **Impacto:** quem espera um menu encontra uma rolagem; rótulo e ação não batem.
- **Prioridade:** P1 (navegação mobile).
- **Critério de aceite:** o botão "Menu" abre um painel com as seções (Catálogo, Nema, FAQ, Sobre, Minha Biblioteca), com `aria-expanded` atualizado, foco no primeiro item, e fecha com Escape. Ou o rótulo muda para o que de fato faz.

### F-07 · Nove controles sem contorno de foco visível
- **Componente:** `index.html`: botões de idioma (PT, EN, ES), filtros do catálogo (Todos, Ficção, Ensaios, Manuais, Infantil) e o link "Como funciona o Nema".
- **Evidência:** navegação por Tab em 260 passos; `outline-style: none` no elemento focado. A página só define `:focus-visible` para `.ab-pular`.
- **Critério WCAG:** 2.4.7 (foco visível), nível AA.
- **Prioridade:** P1 (acessibilidade, critério AA).
- **Critério de aceite:** todo elemento interativo mostra contorno de pelo menos 2 px com contraste ≥ 3:1 ao receber foco por teclado.

### F-08 · Alvos de toque pequenos no celular
- **Evidência:** em 375 px, dos 9 controles visíveis na página inicial, 7 têm menos de 44 px em alguma dimensão (idiomas 33×24 px, "Menu" 30×33 px). No catálogo, 8 de 9 (por exemplo "Menu" 30×21 px).
- **Critério:** WCAG 2.5.8 (nível AA) exige 24 px; 2.5.5 (nível AAA) exige 44 px. Abaixo de 24 px, pelo critério AA, há só o "Menu" do catálogo (altura de 21 px). Os idiomas têm 24 px de altura: atendem AA, mas não AAA.
- **Prioridade:** P2.
- **Critério de aceite:** controles primários com 44 px; nenhum controle abaixo de 24 px.

### F-09 · Falha ao carregar o catálogo não oferece nova tentativa na página inicial
- **Componente:** `index.html`, `TTClient.getCatalogo().catch(...)`.
- **Evidência:** com a API respondendo com erro, a mensagem "Não foi possível carregar o catálogo agora. Recarregue a página em instantes." aparece, sem botão. O cliente de catálogo (`js/tt-client.js`, `renderCatalogo`) tem botão "Tentar de novo"; a página inicial não o usa.
- **Prioridade:** P2.
- **Critério de aceite:** falha mostra botão "Tentar de novo" que refaz a chamada e restaura o estado de carregamento.

---

## MELHORIAS RECOMENDADAS

### M-01 · Cartões de produto clicáveis por `div` (mouse)
- O cartão inteiro navega por `card.onclick` (`index.html`, `renderProdutos`). Não tem papel nem foco. Existe, porém, um link "Adquirir" dentro do cartão, alcançado por Tab em todos os cartões (18 vezes na navegação medida). Não é bloqueio; é ergonomia e semântica.
- **Prioridade:** P2. **Critério:** o cartão é um link único (`<a>` com o título) ou o clique é só do link.

### M-02 · Padronizar as durações e as curvas de animação
- Durações espalhadas: na página inicial, `.2s` (13 ocorrências), `.3s` (5), `.25s` (3), `.6s` (2), `.5s` (2), `.55s` (2). São 123 declarações de `transition` ou `animation` nas cinco páginas principais. Há 17 `transition: all`, que animam todas as propriedades (index 5, catálogo 4, área do cliente 7, minha biblioteca 1). Quatro declarações de animação usam `linear`.
- Não há tokens de movimento nas páginas públicas. `area-cliente.html` tem `--ease-out` sozinho, sem uso compartilhado.
- **Prioridade:** P2. Ver `PADRAO_DE_TRANSICOES.md`.

### M-03 · Imagens da abertura carregadas no início
- `index.html` cria cinco objetos `Image` no carregamento, independentemente da rolagem. São cerca de 197 KB no total (`assets/abertura/cena-1..5.jpg`).
- **Prioridade:** P3. Pequeno ganho; carregar a cena seguinte só quando a rolagem se aproximar dela.

### M-04 · Capas do catálogo como `background-image`, sem dimensão reservada nem carregamento preguiçoso
- A página inicial não tem nenhum `<img>` no carregamento (0 elementos). As capas entram por `style="background-image:url(...)"` nos cartões, sem `loading="lazy"` e sem proporção reservada no HTML. O risco de deslocamento de layout (CLS) não foi medido (PENDENTE P-04).
- **Prioridade:** P2.

### M-05 · Heading e landmarks
- axe: `heading-order` (moderado) na página inicial, em `h5` do rodapé; `region` (moderado, 20 nós): conteúdo, como o vídeo de fundo, fora de landmarks; no catálogo, `aria-allowed-role` (menor, 3 artigos).
- **Prioridade:** P3.

### M-06 · Uso de `transition: all`
- 17 ocorrências nas páginas públicas (index 5, catálogo 4, área do cliente 7, minha biblioteca 1). Em conjunto com M-02, troca por propriedades explícitas (`transform`, `opacity`, `background-color`, `box-shadow`).
- **Prioridade:** P2.

---

## PENDENTES DE TESTE

| ID | Hipótese | Por que está pendente | Como validar |
|---|---|---|---|
| P-01 | A causa de F-01 é o primeiro quadro com intervalo zero | Não instrumentado | Registrar `ts` e `dt` em `quadro()` num Chromium de teste, com salto por âncora |
| P-02 | O vídeo de F-02 toca de fato e atrasa a primeira pintura em celular | Chromium do laboratório não tem H.264 | Aparelho Android e iPhone com dados móveis; medir LCP e dados transferidos |
| P-03 | O custo de F-03 e F-04 se confirma em aparelho intermediário | Laboratório sem GPU | Chrome DevTools remoto em aparelho intermediário, rolagem padronizada, 3 execuções |
| P-04 | Há deslocamento de layout (CLS) ao carregar capas e fontes | Fontes do Google bloqueadas no laboratório | Lighthouse com rede real; trace de layout shift |
| P-05 | Leitores de tela anunciam corretamente FAQ, menu e filtros | Nenhum leitor de tela disponível aqui | NVDA no Windows e VoiceOver no iPhone, roteiro fixo |
| P-06 | Gestos de toque conflitam com a rolagem vertical na abertura e na biblioteca | Sem toque real | Teste em aparelho com roteiro de gestos |

---

## FUNCIONA (preservar)

| ID | Controle | Evidência |
|---|---|---|
| OK-01 | "Reduzir movimento" é respeitado pelos dois scripts de rolagem: a abertura não roda e a rolagem guiada não ativa a classe `ent-on` | `movimento_reduzido`: `ent-on` ausente, 11 de 11 blocos visíveis |
| OK-02 | Sem rolagem horizontal indesejada | `scrollWidth == clientWidth` em 375 px e 1280 px, em todas as páginas medidas |
| OK-03 | Páginas P0 abrem sem erro de página em celular (checkout com botão "Pagar com PIX ou Cartão", área do cliente, Nema, Minha Biblioteca, catálogo) | `p0.mjs`, com a API simulada |
| OK-04 | Menu do catálogo com `aria-expanded` correto e Escape fecha | `menu_catalogo`: `false` → `true` → `false` |
