# Plano de implementação

Entrega 9 da auditoria. Sequência incremental, sem executar nenhuma alteração. Só começa depois da aprovação explícita da especificação. Sem estimativa de duração, porque o tamanho real das mudanças depende da confirmação das causas (P-01).

Regra geral para todas as etapas: uma mudança por commit, cada uma com reversão por `git revert`, e medição antes e depois conforme `PLANO_DE_MEDICAO_PERFORMANCE.md`.

## Etapa 1 — Estabilização do comportamento existente

**Objetivo:** corrigir os achados P1 de conteúdo e de navegação que estão confirmados.

**Itens:** F-01 (revelação após salto), F-06 (botão "Menu" da página inicial), F-09 (nova tentativa do catálogo).

**Arquivos prováveis:** `index.html` (script "Rolagem guiada", botão `.menu-mob`, função de carregamento do catálogo).

**Pré-requisitos:**
- P-01 concluído: a causa de F-01 confirmada por instrumentação, com registro do `dt` do primeiro quadro.
- Linha de base medida.

**Alterações previstas:**
1. Corrigir o cálculo do primeiro quadro após o reinício, para que o passo não seja zero. Garantir estado final após qualquer salto.
2. Trocar o comportamento do botão "Menu" por um painel real com `aria-expanded`, ou trocar rótulo e ação para o que o botão faz.
3. Adicionar botão "Tentar de novo" ao estado de falha do catálogo na página inicial.

**Testes:**
- `salto-ent` e `percorre` (evidências): após salto, todos os blocos em opacidade 1 em até 1 s.
- Teste novo: botão "Menu" abre, fecha com Escape e atualiza `aria-expanded`.
- Teste novo: API fora leva a estado de erro com botão, e o botão refaz a chamada.
- Regressão: `run.mjs` e `p0.mjs` sem erros de página.

**Critérios de conclusão:** os três testes passam; medição de quadros não piora além dos limites do plano.

**Riscos:**
- Corrigir o laço altera a revelação da abertura por câmera. Mitigar com comparação das cinco cenas antes e depois.
- O painel do "Menu" pode colidir com o cabeçalho fixo. Testar em 375 px.

**Reversão:** `git revert` do commit da etapa.

## Etapa 2 — Centralização dos padrões de animação

**Objetivo:** declarar os tokens de movimento e aplicá-los sem mudar a aparência.

**Arquivos prováveis:** `index.html`, `catalogo.html`, `checkout.html`, `area-cliente.html`, `minha-biblioteca.html`, `nema.html`. Como não há arquivo de estilos compartilhado, criar um bloco `:root` padronizado em cada página ou um arquivo `css/tokens-movimento.css`, decisão a tomar antes de iniciar.

**Pré-requisitos:** Etapa 1 concluída.

**Alterações previstas:**
1. Declarar os tokens do `PADRAO_DE_TRANSICOES.md` §2.1.
2. Substituir as durações e curvas dispersas pelos tokens, sem alterar valores visíveis além do necessário. Registrar cada mudança de valor.
3. Trocar `transition: all` (17 ocorrências) por propriedades explícitas.
4. Adicionar `@media (prefers-reduced-motion: reduce)` com desligamento das animações decorativas.

**Testes:**
- Comparação visual das páginas antes e depois, com capturas nos dois tamanhos de tela.
- Teste de movimento reduzido: nenhum keyframe decorativo em execução.
- axe: sem violações novas.

**Critérios de conclusão:** zero `transition: all`; zero durações fora dos tokens; movimento reduzido desliga os keyframes decorativos.

**Riscos:** mudança visual não intencional. Mitigar com capturas e aprovação do responsável.

**Reversão:** `git revert` por página, porque cada página é independente.

## Etapa 3 — Padronização dos estados de carregamento

**Objetivo:** aplicar a especificação de carregamento editorial na página inicial e no catálogo.

**Arquivos prováveis:** `index.html` (carregamento do catálogo), `js/tt-client.js`, `catalogo.html`.

**Pré-requisitos:** Etapas 1 e 2.

**Alterações previstas:**
1. Placeholder de cartão com a dimensão fixa atual, sem animação infinita.
2. Estado de espera só após 400 ms.
3. Anúncio único por estado, com live region `polite`.
4. `aria-busy` no grid durante a espera.
5. Substituir o texto simples de falha pelo estado de erro com nova tentativa.

**Testes:**
- API com respostas de 100 ms, 1 s e erro: estado correto em cada caso.
- Teste de anúncios: um por estado.
- axe e teste de teclado no botão de nova tentativa.

**Critérios de conclusão:** nenhum percentual exibido; nenhuma animação de espera abaixo de 400 ms; anúncios conforme a especificação.

**Riscos:** o anúncio pode ser excessivo se houver mais estados que o previsto. Mitigar com o teste de anúncios.

**Reversão:** `git revert`.

## Etapa 4 — Protótipo de navegação horizontal

**Objetivo:** validar a faixa horizontal (arquitetura B) em **um** componente, sem alterar a rolagem da página.

**Arquivos prováveis:** `index.html` (grade de `#prod-grid`), possivelmente um arquivo de teste isolado em `docs/auditoria-interface/prototipos/` para não tocar a produção.

**Pré-requisitos:** Etapas 1 a 3. Decisão do responsável de que o catálogo passou de cerca de seis livros (ver `ANALISE_NAVEGACAO_HORIZONTAL.md` §4).

**Alterações previstas:**
1. Faixa com `overflow-x: auto`, `scroll-snap-type: x mandatory`.
2. Botões "anterior" e "próximo" visíveis, com foco e rótulos.
3. Nenhum gesto obrigatório.

**Testes:**
- Teclado: alcançar todos os cartões pela faixa.
- Toque em 375 px: a rolagem vertical da página continua funcionando sobre a faixa.
- Leitor de tela: a faixa é anunciada como lista.

**Critérios de conclusão:** os três testes passam sem exceção; sem perda de desempenho pela medição.

**Riscos:** a faixa pode prender a rolagem vertical no celular. Mitigar com teste de toque em aparelho (P-06).

**Reversão:** remover o protótipo; nada da produção foi alterado.

## Etapa 5 — Validação em computador, celular, teclado e movimento reduzido

**Objetivo:** executar as pendências de validação que dependem de aparelho e de ferramentas externas.

**Itens:** P-02 (vídeo em celular real), P-03 (quadros em aparelho intermediário), P-04 (CLS com rede real), P-05 (NVDA e VoiceOver), P-06 (gestos), P-07 (modais), P-08 (login e compra em ambiente de teste), P-09 (paisagem e rede lenta).

**Pré-requisitos:** Etapas 1 a 4.

**Critérios de conclusão:** cada pendência marcada como confirmada ou descartada, com evidência anexada.

**Riscos:** pendências que revelem novos defeitos. Tratar como novos achados e voltar ao registro.

## Etapa 6 — Expansão para os demais componentes aprovados

**Objetivo:** aplicar os padrões já validados aos componentes aprovados na Etapa 5.

**Arquivos prováveis:** conforme cada componente aprovado. Provavelmente `catalogo.html`, `area-cliente.html`, `minha-biblioteca.html`.

**Pré-requisitos:** Etapa 5 concluída, com aprovação escrita da lista de componentes.

**Critérios de conclusão:** cada componente com testes da etapa de origem e sem regressão nas medições.

**Reversão:** por componente.

## Etapa 7 — Testes de regressão e comparação de desempenho

**Objetivo:** provar que as mudanças não pioraram nada medido.

**Itens:** repetir o conjunto de testes de todas as etapas; comparar com a linha de base; aplicar os critérios de regressão do plano de medição.

**Critérios de conclusão:** nenhuma regressão acima dos limites; relatório anexado.

## Etapa 8 — Preparação para publicação com estratégia de reversão

**Objetivo:** publicar com possibilidade de voltar rapidamente.

**Itens:**
1. Abrir o Pull Request contra `main`, com a descrição das etapas e das evidências.
2. Revisão humana do responsável.
3. Publicar pelo GitHub Pages.
4. Monitorar o endpoint de medição (quando existir) nas primeiras 48 horas.

**Estratégia de reversão:** `git revert` do merge; o GitHub Pages volta à versão anterior após o novo deploy. Nenhuma migração de banco é necessária nesta trilha.

**Critérios de conclusão:** publicação feita; reversão testada em ambiente de teste.

**Observação:** o site é estático, então a publicação não tem a etapa de rolagem gradual que o Worker tem (ver a configuração de staging em `supabase/deploy.md`). Se a equipe quiser revisão em produção antes de todos verem, a única alternativa é uma página de teste em outro caminho, o que não está previsto neste plano.

## Resumo da ordem

| Etapa | Entra quando | Sai quando |
|---|---|---|
| 1. Estabilização | P-01 confirmado | Três testes passam |
| 2. Tokens | Etapa 1 | Zero `transition: all` |
| 3. Carregamento | Etapas 1 e 2 | Estados e anúncios conforme especificação |
| 4. Protótipo horizontal | Decisão sobre o catálogo | Três testes passam |
| 5. Validação | Etapas 1 a 4 | Todas as pendências com evidência |
| 6. Expansão | Lista aprovada | Sem regressão |
| 7. Regressão | Etapa 6 | Relatório sem regressão |
| 8. Publicação | Etapa 7 | Publicado, reversão testada |
