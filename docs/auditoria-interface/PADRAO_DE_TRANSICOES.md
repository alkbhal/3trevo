# Padrão de transições — contrato proposto

Entrega 3 da auditoria. Inventário do que existe, custo medido e contrato proposto. Nada foi implementado. Os valores abaixo são **hipóteses iniciais**, a validar com os testes de `PLANO_DE_MEDICAO_PERFORMANCE.md`.

## 1. Inventário atual

### 1.1 Números

| Página | `transition` + `animation` | Durações distintas mais usadas | Curvas |
|---|---|---|---|
| `index.html` | 36 (27 `transition` + 9 `animation`) | `.2s` (13), `.3s` (5), `.25s` (3), `.6s` (2), `.5s` (2), `.55s` (2) | `linear` (1), `ease-in-out` (5), três `cubic-bezier` |
| `catalogo.html` | 22 (`transition`) | `.2s` (13), `.3s` (5), `.25s` (3), `.7s` (2) | sem `linear` em transição |
| `checkout.html` | 5 | `.2s` (4) | `linear` (1) |
| `area-cliente.html` | 54 (34 `transition` + 20 `animation`) | `.2s` (23), `.25s` (4), `.1s` (3), `.15s` (3), `.35s` (2) | `linear` (2), `--ease-out` (token local) |
| `minha-biblioteca.html` | 6 | `.2s` (4), `.3s`, `.15s` | `linear` (1) |

Contagem por busca textual: é aproximada, serve para mostrar dispersão, não para contar com precisão.

### 1.2 Tipos de animação

| Tipo | Onde | Mecanismo | Observação |
|---|---|---|---|
| Entrada de cards | `index.html` `.fi`, `.pcard` | `IntersectionObserver` + classe `vis` + `setTimeout` por índice | Escalonamento com `setTimeout` (120 ms por item) |
| Hover em cartões e botões | CSS | `transition` com `transform`, `box-shadow`, cor | 12 regras `:hover` na página inicial |
| Abertura do acordeão (FAQ) | `index.html` `.faq-item.open` | Classe + CSS | Não medido |
| Menu móvel | `catalogo.html` `#navMobile` | Classe + `transition: all .3s` nas barras do ícone | Estado ARIA correto (OK-04) |
| Abertura por câmera | `index.html` `#abertura` | `requestAnimationFrame` + estilo por quadro | Desativada com movimento reduzido |
| Rolagem guiada | `index.html` `[data-ent]` | `requestAnimationFrame` + variável `--p` | Ver F-01 e F-03 |
| Entrada do Nema | `index.html` `#nema` | Keyframes disparados por `IntersectionObserver` | Roda uma vez |
| Keyframes contínuos | `index.html` | `livro-float`, `sc-bob`, `mini-float`, `badge-shine`, `pulse-dot` | Sem `prefers-reduced-motion` em CSS |
| Esqueleto de carregamento | `area-cliente.html` | `shimmer` (1,5 s, infinito) | Não medido |
| Entrada da área do cliente | `area-cliente.html` | `fadeUp` (0,3 s) | — |
| Toast | `area-cliente.html` | `transition` de opacidade e posição (0,35 s) | — |

### 1.3 Duplicações e inconsistências

- **Quatro durações "de botão" diferentes** (`.15s`, `.2s`, `.25s`, `.3s`) sem critério.
- **`transition: all` em 17 lugares** (index 5, catálogo 4, área do cliente 7, minha biblioteca 1). Anima qualquer propriedade que mudar, inclusive as caras (layout).
- **Dois sistemas de rolagem por quadro** na página inicial (abertura e rolagem guiada), cada um com seu laço, sua suavização e seu reinício. A duplicação explica parte do custo medido (F-03).
- **Nenhuma curva compartilhada.** `--ease-out` existe só na área do cliente.
- **Movimento reduzido tratado em três formas diferentes:** JavaScript que não inicia (abertura), JavaScript que não adiciona a classe (rolagem guiada) e nada no CSS (keyframes, transições, toast).

### 1.4 Conflitos

- A rolagem guiada escreve `opacity` e `filter` nos mesmos elementos que o CSS de `.fi`/`.pcard` anima por `vis`. Se os dois agirem no mesmo nó, o último a escrever vence. Não foi reproduzido, mas o risco está no código.
- `will-change` permanente (F-04) conflita com a própria ideia de animar só quando necessário.

## 2. Contrato proposto

### 2.1 Tokens

Os nomes seguem a convenção do projeto, em português, como `--ouro`, `--borda` e `--sombra-card`. O token `--ease-out` da área do cliente passa a ser a base.

```css
:root {
  /* duração */
  --mov-rapido: 160ms;     /* feedback de botão, hover */
  --mov-padrao: 240ms;     /* troca de seção, abertura de painel */
  --mov-lento: 320ms;      /* entrada de bloco grande; teto */

  /* curva */
  --mov-entrar: cubic-bezier(0.22, 1, 0.36, 1);    /* desacelera ao chegar */
  --mov-sair: cubic-bezier(0.4, 0, 1, 1);          /* acelera ao sair */
  --mov-padrao-curva: cubic-bezier(0.4, 0, 0.2, 1);

  /* distância */
  --mov-deslocamento-pequeno: 8px;
  --mov-deslocamento-medio: 16px;   /* teto para entrada de bloco */
}
```

Os intervalos `150–220 ms`, `180–260 ms`, `220–320 ms` e `24–48 px` do briefing continuam como **hipóteses de partida**. Os valores acima escolhem um ponto em cada intervalo e precisam ser validados no site.

### 2.2 Regras

1. **Só `transform` e `opacity` são animados.** Qualquer outra propriedade exige justificativa escrita. `filter`, `clip-path` e `box-shadow` animados entram nessa exceção e passam pela medição.
2. **Sem `transition: all`.** Listar as propriedades.
3. **`will-change` só durante a animação.** Adicionar ao iniciar, remover ao terminar. Nunca em estado estático.
4. **Movimento reduzido em CSS e em JavaScript.** O CSS desliga as animações com `@media (prefers-reduced-motion: reduce)`. O JavaScript só lê a preferência para não iniciar laços. Os dois valem juntos.
5. **Uma animação por elemento.** Ao receber nova animação, a anterior é cancelada (`element.getAnimations()`, ou variável de estado).
6. **Cancelar ao sair.** Se o elemento desaparecer da página ou da tela, a animação para.
7. **Revelação com estado terminal.** Todo bloco revelado chega a um estado final (`opacity: 1`, sem `filter`, sem `transform` residual). Qualquer estado intermediário precisa de um tempo máximo e de um salto para o final.
8. **Interrupção.** Um toque ou uma tecla durante a animação leva ao estado final, não ao meio.
9. **Animação de entrada só na primeira aparição.** Rolar de volta não reanima (o Nema já segue essa regra).
10. **Erros.** Se o conteúdo de um bloco falhar, o bloco mostra o estado de erro sem animação de entrada.

### 2.3 Padrões por componente

| Componente | Animação | Duração | Curva | Observação |
|---|---|---|---|---|
| Botão (hover, foco) | cor e `transform: translateY(-1px)` | `--mov-rapido` | `--mov-padrao-curva` | sem `box-shadow` animada |
| Cartão de livro (hover) | `translateY(-3px)` e sombra fixa mais forte | `--mov-padrao` | `--mov-entrar` | sombra trocada por pseudo-elemento para não animar `box-shadow` |
| Abertura de painel (menu, FAQ) | `opacity` e `transform` | `--mov-padrao` | `--mov-entrar` ao abrir, `--mov-sair` ao fechar | altura com `grid-template-rows` 0→1fr, não `height` |
| Modal | `opacity` e `transform: scale(.98)` | 200 ms | `--mov-entrar` | foco inicial e retorno do foco |
| Entrada de bloco na rolagem | `opacity` e `translateY(16px)` | `--mov-lento` | `--mov-entrar` | uma vez, sem `filter` |
| Troca de seção (área do cliente) | `opacity` | `--mov-rapido` | `--mov-padrao-curva` | sem deslocamento |
| Carregamento | ver `ESPECIFICACAO_CARREGAMENTO_EDITORIAL.md` | — | — | — |
| Keyframes decorativos (flutuação do livro, brilho, capas) | — | — | — | **Desligar com movimento reduzido** ou remover. Inclui `mini-float` (5 s, infinito) em cada capa do catálogo, medida como `animation` no CSS (`index.html` linha 301–307) |

### 2.4 Desempenho

- Medir antes de adotar cada animação nova (ver plano de medição).
- Animações de fundo contínuas (`livro-float`, `pulse-dot`, `badge-shine`) são candidatas a remoção: não servem à leitura nem à compra.
- A abertura por câmera e a rolagem guiada devem ser unificadas num só laço de rolagem antes de qualquer expansão (ver F-03 e `SPEC_EVOLUCAO_INTERFACE.md`).

## 3. O que não fazer

- Não criar um sistema de animação de biblioteca externa para isso. Não há justificativa demonstrada; o problema medido é de escolha de propriedades e de laços duplicados.
- Não transformar cada padrão em componente antes de validar os tokens no site.
- Não usar animação para esconder atraso de carregamento (ver `ESPECIFICACAO_CARREGAMENTO_EDITORIAL.md`).
