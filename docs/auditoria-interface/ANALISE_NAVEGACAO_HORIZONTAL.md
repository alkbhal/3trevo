# Análise: navegação horizontal

Entrega 2 da auditoria. Compara as três arquiteturas propostas e recomenda uma, com base no que foi medido. Nenhuma alteração foi feita.

## 1. Situação atual

- A navegação do site é vertical, pela rolagem nativa do documento. A página inicial não tem carrossel, nem contêiner com rolagem, nem `scroll-snap`.
- O único movimento "guiado" da página é a **abertura por câmera**, que mapeia a posição vertical da rolagem sobre cinco cenas. É um padrão de "rolagem como linha do tempo", já presente no site.
- O catálogo tem **três livros** publicados. Com esse número, uma faixa horizontal não resolve um problema de descoberta: a grade inteira cabe em uma tela de computador.
- Os textos longos da página (FAQ, Nema, Sobre) são lidos por rolagem vertical e a acessibilidade depende disso.

## 2. Evidências que pesam na decisão

| Evidência | Efeito na escolha |
|---|---|
| F-01: blocos de rolagem guiada somem após um salto (medido) | O padrão "rolagem como timeline" já é frágil. Estender esse padrão para a navegação principal multiplicaria o risco. |
| F-07: nove controles sem foco visível | Qualquer navegação horizontal precisaria de controles de teclado que hoje não existem em outras partes do site. |
| F-09 e F-06: falhas de estado e botão "Menu" que não faz o que diz | A navegação atual já tem inconsistências. Trocar o modelo antes de corrigi-las amplia a superfície de erro. |
| 375 px sem rolagem horizontal (medido) | Hoje não há problema de largura que uma faixa resolveria. |
| Três livros no catálogo | Carrossel horizontal com três itens é pior que grade: esconde itens fora da tela. |

## 3. As três arquiteturas

### Arquitetura A — livro horizontal (cada seção ocupa a tela; avança-se lateralmente)

| Critério | Avaliação |
|---|---|
| Viabilidade no código atual | Baixa. Exige reescrever o fluxo de rolagem da página inteira, incluindo a abertura, o Nema e as entradas `[data-ent]`. |
| Teclado | Exige tratar Tab, setas e foco entre painéis. Hoje não há gerenciamento de foco. |
| Botão Voltar e URLs | Sem rotas por seção, o Voltar do navegador sai do site. Com rotas por seção, é preciso um roteador que hoje não existe. |
| Textos longos | Ruim. FAQ e Sobre precisariam de rolagem interna dentro de painéis, o que conflita com a rolagem do documento (risco de "aprisionamento"). |
| Celular | Gestos horizontais conflitam com a rolagem vertical e com a navegação lateral do próprio sistema operacional (iOS e Android). |
| SEO | Conteúdo empilhado em painéis costuma ser indexado pior. Exige teste em rastreador, não suposição. |
| Desempenho | Pior: todos os painéis precisam de layout estável. A abertura já mostra o custo de cinco cenas em movimento. |
| Risco de regressão | Alto. Afeta todas as páginas que compartilham a rolagem. |

**Veredicto:** não recomendada. Os riscos de acessibilidade e de conflito de gestos são estruturais, e o site hoje não tem a base de foco, de rotas e de rolagem que essa arquitetura pede.

### Arquitetura B — página vertical com elementos horizontais (faixas)

| Critério | Avaliação |
|---|---|
| Vantagens | Mantém a leitura e o Voltar. Pode ser aplicada só onde a lista cresce. |
| Limitações | Com três livros, a faixa esconde itens. Com muitos livros, precisa de botões de avanço e de indicadores. |
| Compatibilidade | Boa com o HTML atual. A grade de `renderProdutos` pode virar faixa com `overflow-x` e `scroll-snap`. |
| Custo | Baixo a médio. |
| Teclado | Exige botões "anterior/próximo" visíveis e foco dentro da faixa. Hoje não existem. |
| Risco | Baixo, se restrita ao catálogo. |

**Veredicto:** viável e de baixo risco, mas **sem ganho agora** (três livros). Passa a fazer sentido quando o catálogo tiver mais itens do que cabe numa tela de celular.

### Arquitetura C — modelo híbrido

Navegação entre áreas com transição horizontal, textos longos com rolagem vertical, faixas com controles acessíveis, URLs preservadas.

| Critério | Avaliação |
|---|---|
| Vantagens | Une a leitura vertical com a faixa para listas. Preserva URLs se a navegação entre áreas continuar sendo por página. |
| Limitações | "Navegação horizontal entre áreas" exige roteador ou troca de página. Sem isso, vira um efeito visual sem função. |
| Custo | Médio a alto, se a transição entre áreas for implementada. Baixo, se ficar nas faixas (é a arquitetura B). |
| Risco | Médio. |

**Veredicto:** a parte C que é viável agora é a B: faixas horizontais onde há lista. A parte que muda a navegação entre áreas não tem evidência de que resolva um problema medido.

## 4. Recomendação

1. **Não iniciar a migração para navegação horizontal.** Nenhum problema medido seria resolvido por ela.
2. **Corrigir primeiro os achados de navegação e de conteúdo:** F-01 (revelação após salto), F-02 (vídeo), F-06 (botão "Menu") e F-07 (foco).
3. **Quando o catálogo passar de cerca de seis livros,** avaliar a faixa horizontal da arquitetura B no catálogo e na área do cliente, com controles de teclado e sem gestos obrigatórios.
4. **Reabrir a decisão da arquitetura C** apenas se houver evidência de uso: mapa de cliques, tempo por seção, ou pesquisa com leitores.

## 5. Mecanismos que poderiam ser usados (apenas se a arquitetura B for aprovada)

| Mecanismo | Quando usar | Cuidado |
|---|---|---|
| `scroll-snap-type: x mandatory` com `overflow-x: auto` | Faixa de capas | Testar com teclado e com leitor de tela |
| Botões "anterior/próximo" visíveis | Sempre que houver faixa | Ocultar só quando o conteúdo couber na tela |
| Transição entre páginas (`View Transitions`) | Só se a arquitetura C for aprovada | Verificar suporte antes; manter a navegação funcionando sem ela |
| Gestos de toque | Nunca como único meio | Não bloquear a rolagem vertical |
| Preservar a posição de rolagem | Ao voltar da página de um livro | Hoje não há mecanismo; medir antes de implementar |

## 6. Regras que valem para qualquer versão

- Nenhuma navegação pode depender só de gesto.
- Nenhum script global de teclado pode impedir digitação em formulários.
- A rolagem horizontal não pode sequestrar a vertical.
- URLs e o botão Voltar do navegador precisam continuar funcionando.
- O conteúdo precisa estar acessível a leitores de tela e à navegação por teclado.
