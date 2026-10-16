# Relatório executivo — auditoria de interface

Entrega 10. Data: 16/10/2026. Responde às doze perguntas da missão, na ordem pedida. Detalhes em cada documento citado.

## Resumo em três frases

O site é estático (HTML, CSS e JavaScript puro) e tem um problema real de conteúdo: as perguntas frequentes e o bloco "Quem somos" podem ficar invisíveis quando a página muda de posição de uma vez. Há também custo de desempenho medido no movimento padrão, um vídeo de 7,5 MB que toca sozinho sem pausa, e falhas de acessibilidade em contraste e foco. A recomendação é corrigir esses pontos antes de qualquer mudança de navegação ou de animação nova.

## 1. Como o site funciona hoje?

É um conjunto de páginas HTML separadas, publicadas no GitHub Pages em `3trevo.com.br`. A página inicial tem herói com vídeo, uma abertura guiada pela rolagem, catálogo, programa Nema, FAQ e rodapé. O catálogo, o checkout e a área do cliente conversam com um Worker na Cloudflare, que fala com o Supabase. Não há framework nem etapa de compilação para a interface.
*(MAPA_TECNICO_ATUAL.md, §1–3)*

## 2. Onde está implementada a navegação vertical?

É a rolagem nativa do documento. Não há carrossel, contêiner com rolagem nem `scroll-snap` na página inicial. A única "navegação guiada" é a abertura por câmera, que mapeia a posição da rolagem sobre cinco cenas, e a rolagem guiada, que revela blocos conforme o usuário desce.
*(MAPA_TECNICO_ATUAL.md, §4.1–4.3)*

## 3. Quais mecanismos de transição já existem?

Cinco tipos: transições CSS em hover e foco (dispersas, com 123 declarações nas cinco páginas principais); keyframes decorativos contínuos (flutuação do livro, brilho, capas); a abertura por câmera e a rolagem guiada, ambas por `requestAnimationFrame`; a entrada do Nema, disparada uma vez; e a revelação de cards por `IntersectionObserver`. Não há tokens de movimento compartilhados.
*(PADRAO_DE_TRANSICOES.md, §1)*

## 4. Quais partes do carregamento podem ser medidas?

Medidas de forma confiável com as ferramentas disponíveis: o tempo até o `load` (cerca de 2,6 a 3,0 s no laboratório, sem rede real), os bytes do vídeo, as contagens de estilo e de quadros na rolagem, e o tempo de resposta da API. Não medidas ainda: LCP, INP e CLS em aparelho real. O site não coleta nenhuma dessas métricas de usuários reais.
*(PLANO_DE_MEDICAO_PERFORMANCE.md, §2–3)*

## 5. Como implementar o carregamento editorial sem simular progresso?

Associando cada etapa visual a um evento real (resposta da API, `load` de uma capa, fim do tempo limite), sem percentuais, e mostrando a animação só quando a espera passar de 400 ms. Na página inicial, a maior parte da sequência de seis etapas não corresponde a nenhuma espera, então a metáfora do livro cabe melhor na abertura por câmera, que já é guiada pela rolagem.
*(ESPECIFICACAO_CARREGAMENTO_EDITORIAL.md, §3–6)*

## 6. Qual arquitetura horizontal é mais adequada?

Nenhuma agora. A arquitetura A (livro horizontal) tem risco estrutural em acessibilidade, gestos, Voltar do navegador e leitura de textos longos. A arquitetura B (faixas horizontais) é viável e de baixo risco, mas o catálogo tem três livros, e uma faixa esconderia itens. A C depende da B e de uma mudança de navegação entre áreas sem evidência de necessidade. Recomendação: corrigir os achados atuais e reavaliar a B quando o catálogo passar de cerca de seis livros.
*(ANALISE_NAVEGACAO_HORIZONTAL.md, §3–4)*

## 7. Quais problemas foram efetivamente confirmados?

Nove achados confirmados, com medição ou leitura direta do código:

| ID | Problema | Prioridade |
|---|---|---|
| F-01 | Blocos de FAQ e "Quem somos" ficam invisíveis após salto de posição, e não se recuperam com rolagem posterior | P1 (P0 se a FAQ for caminho obrigatório de compra) |
| F-02 | Vídeo de 7,5 MB toca sozinho, sem pausa, e é baixado mesmo com movimento reduzido | P1 |
| F-03 | Movimento padrão custa mais que o reduzido: 38–44 quadros acima de 20 ms contra 1–3 | P1 (laboratório) |
| F-04 | 27 elementos com `will-change` permanente no carregamento | P2 |
| F-05 | Contraste de texto pequeno entre 1,6:1 e 3,7:1 no catálogo | P1 |
| F-06 | Botão "Menu" da página inicial não abre menu, só rola até o catálogo | P1 |
| F-07 | Nove controles sem contorno de foco | P1 |
| F-08 | Alvos de toque pequenos no celular | P2 |
| F-09 | Falha do catálogo na página inicial sem botão de nova tentativa | P2 |

Os detalhes, a evidência, o critério de aceite e a forma de validar cada um estão em `REGISTRO_DE_ACHADOS.md`.

## 8. Quais oportunidades são recomendadas?

Seis melhorias: cartões como links únicos (M-01), padronização de durações e curvas (M-02), abertura com carregamento sob demanda (M-03), capas com carregamento preguiçoso e dimensão reservada (M-04), correções de títulos e landmarks (M-05), e troca de `transition: all` (M-06).

## 9. O que ainda precisa ser testado?

Seis pendências, todas com roteiro de teste no registro: causa exata do F-01 por instrumentação (P-01); reprodução do vídeo e custo em celular real (P-02); quadros em aparelho intermediário (P-03); deslocamento de layout com rede real (P-04); leitores de tela (P-05); gestos de toque (P-06). Além disso, modais da Minha Biblioteca (P-07), envio de login e compra (P-08), paisagem e rede lenta (P-09).

## 10. Quais são as prioridades?

1. **Conteúdo e navegação:** F-01, F-06.
2. **Vídeo e movimento:** F-02, F-03, F-04.
3. **Acessibilidade:** F-05, F-07, depois F-08 e F-09.
4. **Melhorias:** M-01 a M-06, depois da etapa 2 do plano.

Nenhum item de preferência estética foi classificado como defeito.

## 11. Qual é o menor protótipo capaz de validar a proposta?

Para o achado mais grave, o menor teste é corrigir o laço da rolagem guiada numa cópia local da página inicial e repetir o teste de salto e de rolagem contínua (`salto-ent`, `percorre`). Se os blocos chegarem a opacidade 1 após o salto, a causa está confirmada e a correção validada.

Para a navegação horizontal, o menor protótipo é a faixa de cartões em um arquivo isolado, sem tocar a produção, testada com teclado e toque (Etapa 4 do plano).

## 12. Quais critérios precisam ser aprovados antes da implementação geral?

1. A causa de F-01 está confirmada por instrumentação (P-01).
2. A decisão sobre a arquitetura: manter a rolagem vertical e corrigir os achados, sem navegação horizontal por ora.
3. A lista de componentes que entram na Etapa 6, por escrito.
4. Os valores dos tokens de movimento (`PADRAO_DE_TRANSICOES.md` §2.1) aprovados pelo responsável de marca.
5. A decisão sobre o vídeo do herói: remover, trocar por imagem, ou manter com pausa visível e carregamento condicionado.
6. A linha de base de medição registrada no aparelho de referência.

## Pendências de decisão do responsável

- Se o vídeo do herói continua, e em que condições (movimento reduzido, conexão lenta, pausa visível).
- Se a metáfora do livro entra na abertura, na biblioteca ou em lugar nenhum.
- Se a instrumentação de métricas de usuário real deve entrar no endpoint de rastreamento já existente.

## Limites desta auditoria

- Laboratório com renderização por software; CDNs e API simulados.
- Sem leitores de tela, sem aparelho físico, sem Lighthouse com rede real.
- Nenhum arquivo de produção foi alterado. Os documentos e as evidências estão em `docs/auditoria-interface/`, sem commit.
