# Especificação: carregamento editorial

Entrega 4 da auditoria. Define como representar o carregamento com a linguagem de um livro sendo preparado, sem mostrar progresso que não existe. Nada foi implementado.

## 1. Princípio

A animação acompanha **eventos reais**. Ela não simula percentuais, não espera um tempo fixo e não prolonga uma tela de espera depois que o conteúdo está pronto.

Antes de desenhar qualquer etapa, a pergunta é: **há uma espera real que o usuário percebe?** Se não há, não há animação de carregamento.

## 2. O que a página faz hoje (medido)

| Momento | O que o usuário vê | Tempo medido em laboratório |
|---|---|---|
| HTML chega | Página com cabeçalho, herói e textos | Imediato (HTML estático) |
| Catálogo chega | Texto "Carregando catálogo…" no grid, depois os cartões | 2,6 a 3,0 s até o `load` completo, em laboratório sem rede real |
| Falha do catálogo | Texto de erro, sem botão | Após 8 s (tempo limite de `tt-client.js`) |
| Vídeo do herói | Baixa e toca no `load` | Não medido em aparelho (PENDENTE P-02) |

O tempo "até o catálogo" não foi medido isoladamente. A medição acima é o `load` completo com recursos externos bloqueados; **não representa a espera real do usuário**.

## 3. Mapeamento da metáfora aos eventos reais

A sequência de seis etapas do briefing é uma linguagem visual. Cada etapa só existe se houver um evento correspondente.

| Etapa visual | Evento real correspondente | Existe na página inicial? | Ação |
|---|---|---|---|
| 1. Capa | Estrutura HTML pronta (`DOMContentLoaded`) | Sim, mas é imediata | Não animar. A capa aparece como está. |
| 2. Folha de rosto | Nenhum evento distinto | Não | Não criar |
| 3. Sumário | Cabeçalho e navegação prontos | Sim, já no HTML | Não animar |
| 4. Páginas | Resposta de `GET /api/public/catalogo` | Sim | Animar só se a resposta demorar mais que 400 ms |
| 5. Ilustrações | `load` das capas prioritárias | Sim (`background-image`, ver M-04) | Mostrar o placeholder da capa até o `load`; não aguardar outras capas |
| 6. Livro aberto | Grade renderizada e navegável | Sim | Revelar a grade; nenhuma tela de espera depois disso |

**Conclusão:** na página inicial, só a etapa 4 corresponde a uma espera real, e ela só aparece em conexões lentas. Uma sequência de seis etapas animadas em toda visita seria encenação.

## 4. Estados reais e como representá-los

| Estado | Condição real | Representação | Anúncio para leitor de tela |
|---|---|---|---|
| Pronto (estrutura) | HTML carregado | Nenhuma | — |
| Dados chegando | Requisição em andamento há mais de 400 ms | Placeholder do cartão (bloco de cor, sem animação de brilho infinita) | Nenhum enquanto espera |
| Dados prontos | Resposta recebida | Cartões com capas em placeholder | Uma vez: "Catálogo carregado: N livros" (live region `polite`) |
| Capa pronta | `load` da imagem | Capa substitui placeholder, com opacidade de 160 ms | Nenhum |
| Capa com erro | `error` da imagem | Título do livro sobre a cor do cartão | Nenhum |
| Falha de rede | `catch` ou tempo limite de 8 s | Mensagem e botão "Tentar de novo" | "Não foi possível carregar o catálogo. Use o botão para tentar de novo." |
| Recuperação | Nova tentativa bem-sucedida | Substitui a mensagem pelos cartões | "Catálogo carregado: N livros" |
| Vazio | Resposta com zero livros | Mensagem de vazio | "Nenhum título disponível no momento." |

## 5. Progresso

- **Não usar percentual de carregamento da página.** O navegador não informa um denominador confiável, e um número sem base engana.
- Se houver necessidade de quantificar, o denominador precisa ser explícito e documentado: por exemplo, "capas prioritárias concluídas / capas prioritárias da página". Com três livros, o número não tem valor para o usuário; por isso **não recomendado agora**.
- Preferir mensagens de estado: "Organizando o catálogo…", "Preparando os livros…". Só usar quando a espera real passar de 400 ms, e sem ciclo infinito de texto.

## 6. Relação entre progresso visual e progresso real

A tabela de estados da seção 4 é a única fonte de verdade. A interface deve obedecer a estas regras:

1. Nenhuma etapa aparece sem o evento que a justifica.
2. O estado de espera some quando o evento acontece, e não depois de uma duração fixa.
3. Um recurso secundário (capa de livro fora da tela, por exemplo) nunca bloqueia a interação.
4. `window.onload` não é sinal de prontidão. O sinal é o estado "Dados prontos" da seção 4.
5. Uma requisição concluída não significa página concluída: a página pode estar utilizável com a grade montada e capas ainda carregando.
6. Falha de recurso e falha de rede têm mensagens diferentes.

## 7. Estratégia de carregamento progressivo

| Técnica | Onde | Estado atual | Proposta |
|---|---|---|---|
| Placeholder com dimensão reservada | Capas dos cartões | Dimensão fixa no CSS (`width: 100px; height: 142px`), por isso o deslocamento por capa tende a ser baixo; não medido (PENDENTE P-04) | Manter a dimensão fixa; o placeholder usa a mesma caixa |
| Carregamento preguiçoso | Capas fora da primeira dobra | Ausente | Para `<img>`, `loading="lazy"`; para `background-image`, carregar via JavaScript quando o cartão se aproximar |
| Prioridade | Capas da primeira dobra | Ausente | `fetchpriority="high"` nas capas visíveis, quando forem `<img>` |
| Cache | Catálogo | `Cache-Control: public, max-age=300` no servidor; a página não guarda nada localmente | Manter o cabeçalho; avaliar guardar a última resposta para mostrar já na visita seguinte (com revalidação) |
| Fontes | Google Fonts | Bloqueiam a renderização | `display=swap` já está; avaliar `preload` de uma fonte e `font-display` por família |
| Vídeo | Herói | Baixado no `load` | Ver F-02: não baixar com movimento reduzido nem em conexão lenta |

## 8. Contextos de uso

| Contexto | Animação de carregamento | Feedback |
|---|---|---|
| Primeira visita à página inicial | Nenhuma além do placeholder de cartões, e só se a espera passar de 400 ms | Estados da seção 4 |
| Retorno com cache disponível | Nenhuma | Grade direto |
| Abertura do catálogo | Placeholder de cartões | Estados da seção 4 |
| Troca de categoria | Nenhuma: é filtragem local | Feedback imediato do botão (`--mov-rapido`) |
| Detalhes de um livro | Nenhuma além do placeholder | Estados da seção 4 |
| Minha Biblioteca | Texto de carregamento dos slots, com `aria-busy` | Mensagem se falhar |
| Login | Estado do botão ("Enviando…") | Mensagem de sucesso ou erro |
| Checkout | Estado do botão de pagamento | Mensagem específica por erro |
| Recuperação após falha de rede | Nenhuma | Botão "Tentar de novo" |

Regra geral: **não exibir animação grande em cada navegação.** O feedback local e imediato é preferível quando basta.

## 9. Acessibilidade

- `aria-busy="true"` no grid enquanto espera; removido ao chegar o estado final.
- Um anúncio por estado, não por etapa. Nada de anúncios contínuos.
- Com movimento reduzido: o placeholder fica parado; a animação de capa é uma troca de opacidade ou nenhuma.
- Contraste do texto de carregamento segue as regras da F-05 (no mínimo 4,5:1).
- Quem navega por teclado não perde o foco durante a troca de estados.

## 10. Sequência visual editorial (opcional, para a abertura do lançamento)

Se a equipe quiser a metáfora do livro, ela cabe na **abertura por câmera** (que já existe e já é guiada pela rolagem, o que é honesto: é a própria rolagem que avança a história). Não cabe como tela de espera.

Se for usada em outra página, deve haver uma condição real de espera acima de 400 ms, e cada etapa deve corresponder ao evento da seção 3.

## 11. Critérios de aceite

- Com a API respondendo em menos de 400 ms, nenhuma animação de espera aparece.
- Com a API parada, o estado de erro aparece em até 8 s e tem botão de nova tentativa.
- Nenhum percentual de carregamento é exibido.
- Com movimento reduzido, nenhuma animação de espera roda.
- Os anúncios para leitor de tela são um por estado, testados em NVDA e VoiceOver (PENDENTE P-05).
