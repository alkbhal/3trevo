# Auditoria de interação e responsividade

Entrega 5 da auditoria. Separa o que foi **executado** no navegador, o que foi **lido no código** e o que **ficou pendente**. Um item só aparece como aprovado se teve teste executado.

Ambiente: Chromium headless, 1280×800 (computador) e 375×812 com toque (celular). CDNs externos bloqueados. API simulada. Ver limitações no `MAPA_TECNICO_ATUAL.md`, seção 9.

## 1. Resumo

| Área | Executado | Resultado | Achados |
|---|---|---|---|
| Menus | Sim | Menu do catálogo correto; botão "Menu" da página inicial não abre menu | F-06, OK-04 |
| Modais | Só no código | Página inicial e catálogo não têm modal; modais da Minha Biblioteca não foram exercitados | PENDENTE (ver §3) |
| Cards e catálogo | Sim | Cartões funcionam por mouse e pelo link "Adquirir" no teclado; falha sem botão de tentar de novo | M-01, F-09 |
| Formulários e operações críticas | Carregamento das páginas, sem envio real | Sem erro de página nas páginas P0 | OK-03; envio pendente |
| Mobile | Sim | Sem rolagem horizontal; alvos pequenos | F-08 |
| Acessibilidade | Automática (axe) e teclado | Contraste, foco, landmarks | F-05, F-07, M-05 |

## 2. Menus

### 2.1 Menu do catálogo (`catalogo.html`, `#menuBtn`)
- **Executado:** toque em 375 px. `aria-expanded` vai de `false` para `true`; Escape leva a `false`.
- **Resultado:** **aprovado** (OK-04).

### 2.2 Botão "Menu" da página inicial (`index.html`, `.menu-mob`)
- **Executado:** toque em 375 px. A página rola de 0 para 1161 px. O botão não tem `aria-expanded` e nenhum painel abre.
- **Resultado:** **reprovado** (F-06). Rótulo e comportamento divergem.

### 2.3 Cabeçalho ao rolar
- **Executado:** rolagem com a roda. A classe `scrolled` é aplicada após 80 px (leitura do código, `window.scrollY > 80`).
- **Resultado:** funcional pelo código; **não verificado visualmente**.

## 3. Modais

| Modal | Onde | Estado |
|---|---|---|
| Nenhum modal | `index.html`, `catalogo.html`, `checkout.html`, `nema.html` | Sem modal a testar |
| "Concluir leitura?" (`#modal-lida`) | `minha-biblioteca.html` | **PENDENTE**: exige sessão e slot ativo na API |
| "Adicionar à leitura?" (`#modal-selecionar`) | `minha-biblioteca.html` | **PENDENTE**: exige sessão e catálogo da API |

**O que o código mostra** (leitura, não teste): os dois modais fecham com clique fora (`addEventListener('click')` no overlay) e com os botões Cancelar. **Não há** foco inicial definido, nem armadilha de foco (`focus trap`), nem `role="dialog"`, nem `aria-modal`, nem Escape. Isso é uma lacuna de código, mas a confirmação exige teste de teclado no modal aberto. Registrar como PENDENTE P-07.

## 4. Cards e catálogo

| Teste | Resultado |
|---|---|
| Clique no cartão (mouse) abre o checkout | **Sim**: navega para `checkout.html?slug=livre-das-dividas` |
| Tab alcança o link "Adquirir" de cada cartão | **Sim**: 18 vezes em 255 passos de Tab |
| Feedback visual ao passar o mouse | Regras `:hover` presentes (12); não medido |
| Capas carregam sem deslocamento | Não medido (PENDENTE P-04) |
| Estado sem resultados | Mensagem "Nenhum título disponível no momento." (código) |
| Falha da API | Mensagem sem botão de nova tentativa (F-09) |
| Filtros de categoria | Botões com `ativo`; sem foco visível (F-07) |

## 5. Formulários e operações críticas

| Fluxo | Executado | Resultado |
|---|---|---|
| Checkout carrega com `?slug=` | Sim | Título e botão "Pagar com PIX ou Cartão" presentes; sem erro de página |
| Login da área do cliente | Carregamento da página | Campo de e-mail, botão "Receber link por e-mail" e "Entrar" presentes; **envio não executado** |
| Login da Minha Biblioteca | Carregamento da página | Campo de e-mail e "Receber link de acesso"; **envio não executado** |
| Compra com cartão ou PIX | **Não executado** | Exige Mercado Pago real. PENDENTE |
| Participação no Programa Cultural | **Não executado** | PENDENTE |
| Recuperação de erros de login | **Não executado** | Mensagens de erro existem no código (`msgLogin`); verificar no teste de envio |

**Ponto de atenção:** `checkout.html` mostra "Pagar com PIX ou Cartão" em um único botão. Não foi possível confirmar, sem o gateway, se o botão deixa claro o que acontece depois.

## 6. Mobile (375×812, toque)

| Verificação | Resultado |
|---|---|
| Rolagem horizontal indesejada | **Nenhuma** em `index`, `catalogo`, `checkout`, `nema`, `area-cliente`, `minha-biblioteca` |
| Alvos de toque abaixo de 44 px | Índex: 7 de 9; catálogo: 8 de 9 (F-08) |
| Alvos abaixo de 24 px (AA) | Só o "Menu" do catálogo (21 px de altura) |
| Páginas P0 abrem sem erro de página | **Sim** (OK-03) |
| Gestos de toque conflitando com a rolagem | Não testado com toque real. A página inicial não registra nenhum evento de toque (`touchstart`, `touchend`, `touchmove`: zero ocorrências), então não há gesto próprio a conflitar. PENDENTE P-06 para o leitor e a área do cliente |
| Orientação paisagem | Não testado |
| Comportamento em rede lenta | Não testado com limitação de rede |
| Uso com uma mão | Não avaliado; depende de aparelho |

## 7. Acessibilidade

### 7.1 Automática (axe-core 4.10.2)

| Página | Violações |
|---|---|
| `index.html` | `heading-order` (moderada, 1 nó); `region` (moderada, 20 nós, incluindo o vídeo de fundo) |
| `catalogo.html` | `color-contrast` (grave, 20 nós); `aria-allowed-role` (menor, 3); `heading-order` (moderada); `region` (moderada) |
| `nema.html` | Nenhuma |

O axe cobre uma parte dos critérios WCAG. **Não substitui teste manual.**

### 7.2 Teclado

- **Executado:** 255 passos de Tab na página inicial. Foram alcançados os links do cabeçalho, os idiomas, os filtros, o botão "Como funciona o Nema", os cartões e o rodapé.
- **Foco sem contorno:** nove controles (F-07).
- **Ordem de foco:** segue a ordem do HTML. Não há `tabindex` positivo.
- **Atalhos globais de teclado:** a página inicial não registra nenhum `keydown`. O catálogo registra um, que só fecha o menu móvel com Escape (`catalogo.html`, linha 452). O leitor (`leitor-tt.js`) registra `ArrowRight`, `ArrowLeft`, `PageUp`/`PageDown`, espaço e `Escape` só enquanto está aberto, e os desativa ao fechar. Verificar que o espaço e as setas não interferem em campos de texto quando o leitor está aberto (PENDENTE).

### 7.3 Semântica e nomes acessíveis

- Imagens: a página inicial tem **zero** `<img>` no carregamento; o único `<img>` sem `alt` está dentro de um `<noscript>` de rastreamento (pixel do Facebook), que é aceitável.
- Botões e links com nome: verificados pelo axe (sem violação de `button-name` nem `link-name`).
- Landmarks: `region` aparece em 20 nós na página inicial (M-05).

### 7.4 Leitores de tela

**PENDENTE P-05.** Nenhum leitor de tela disponível neste ambiente. Roteiro de teste a executar: NVDA com Chrome no Windows e VoiceOver no iPhone, percorrendo cabeçalho, catálogo, FAQ e o leitor de livros.

### 7.5 Movimento reduzido

- **Executado:** com a preferência ativa, a rolagem guiada não se ativa e a abertura não roda. Os 11 blocos de revelação ficam visíveis, e as oito entradas do Nema também (OK-01).
- **Não respeitado:** keyframes decorativos (`livro-float`, `mini-float`, `pulse-dot`, `badge-shine`) e o vídeo do herói (F-02). Verificado por busca no código e pelo pedido do vídeo com a preferência ativa.

## 8. Lista de pendências desta entrega

| ID | Item | Motivo | Como executar |
|---|---|---|---|
| P-05 | Leitores de tela | Nenhum disponível | NVDA e VoiceOver |
| P-06 | Gestos de toque | Sem toque real | Aparelho com roteiro |
| P-07 | Modais da Minha Biblioteca (foco, Escape, retorno do foco) | Exige sessão e slot ativo | Teste com sessão de teste no Worker de staging |
| P-08 | Envio de login e fluxo de compra | Exige serviços externos | Ambiente de teste com provedor de e-mail e Mercado Pago de teste |
| P-09 | Orientação paisagem e rede lenta | Não configurado | Lighthouse e DevTools com limitação de rede |
