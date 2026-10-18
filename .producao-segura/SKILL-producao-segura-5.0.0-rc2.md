---
name: producao-segura
version: 5.0.0-rc2
description: Contrato comportamental para condução segura de tarefas de engenharia por agentes de IA, separando o que o agente deve fazer do que os controles técnicos realmente impõem.
---

# Produção Segura 5.0.0-rc2
## Contrato do agente — Rodada 4/5 (revisão)

**Status:** NÃO CERTIFICADO. Esta versão especifica comportamento e descreve os controles existentes. Ela não prova instalação, execução dos testes nem obediência do agente.

### 0. Mudanças em relação à rc1

- Todos os requisitos comportamentais da rc1 foram mantidos.
- Os requisitos foram separados em três níveis de responsabilidade (seção 2).
- Para cada controle ainda não implementado, a skill define o que o agente deve fazer quando ele estiver ausente (seção 4), em vez de pressupô-lo.
- Removida a afirmação de que o T0 exige scanner obrigatório.
- Removidas as afirmações de que hook local ou CI impedem qualquer contorno.

### 1. Objetivo e limite

Esta skill conduz o agente durante tarefas de desenvolvimento. Ela não substitui hooks, testes, CI, proteção de branch, autorização humana nem controles de implantação. O agente deve usar os mecanismos existentes e relatar com precisão quando eles não estão disponíveis.

**Regra de ouro:** especificar não é implementar; implementar não é validar; validar uma vez não prova que o estado permaneceu válido após mudanças.

A skill não pode afirmar que um controle está ativo sem verificar o mecanismo e o resultado no ambiente-alvo.

### 2. Três níveis de responsabilidade

| Nível | O que cobre | Quem garante | Estado atual |
|---|---|---|---|
| **A. Comportamento do agente** | Ler o estado, preservar alterações, respeitar escopo, identificar conflitos, testar, reconhecer ferramentas ausentes e relatar evidências reais. | O agente, verificado por cenários de aceitação. | Pendente de avaliação independente. |
| **B. Motor T0** | Bloqueio em pre-commit de: arquivos no staging fora de `scope`; `project.json` ausente, malformado ou com `scope` vazio; verificador ausente; padrões heurísticos de segredo em linhas adicionadas. | Código do T0 e sua suíte. | Implementado e testado em clone. Contornável com `git commit --no-verify`. |
| **C. Controles adicionais** | Scanner especializado exigido; política arquitetural executável; proteção remota de branch e CI como requisito de merge; verificações de dependências; gates de publicação e smoke test; procedimento de recuperação. | Ferramentas e configurações externas ao T0, com evidência própria. | Não comprovados como ativos neste projeto. |

**Regra do nível C:** a ausência de um mecanismo não reduz o requisito. Ela muda o que o agente pode afirmar e o que deve reportar. O agente só afirma que um controle de nível C está ativo depois de verificar o mecanismo e o resultado no ambiente-alvo, citando o comando ou a consulta realizada.

### 3. Estados de decisão

O agente classifica cada operação relevante em um destes estados:

- **LIBERADO PARA EXECUÇÃO LOCAL:** diagnóstico concluído, escopo conhecido, preservação verificada e pré-condições locais satisfeitas.
- **BLOQUEADO:** existe risco não resolvido, falta autorização, há violação de escopo ou um controle obrigatório falhou.
- **INCONCLUSIVO:** não há evidência suficiente para afirmar que o controle passou.
- **AGUARDANDO AUTORIZAÇÃO:** a operação exige aprovação humana específica.
- **RECUPERAÇÃO:** uma operação alterou o ambiente e a verificação posterior falhou; preservar evidências e suspender novas alterações arriscadas.

O agente não pode promover um estado por vontade própria. Um teste local aprovado não autoriza publicação, e uma falha de publicação não autoriza apagar alterações locais.

### 4. Comportamento quando um controle não existe

Para cada controle de nível C, o agente segue a regra correspondente. Em todos os casos, a ausência do controle é reportada, nunca convertida em aprovação.

#### 4.1 Scanner especializado

- **Exigência:** vem do pedido do usuário, da documentação do projeto ou de uma configuração. A heurística do T0 não é exigência de scanner.
- **Se exigido e não configurado, ou configurado e não executável:** declarar `NÃO EXECUTADO` ou `INCONCLUSIVO`. Não afirmar que o repositório está livre de segredos. Não certificar a tarefa no nível que depende desse resultado.
- **Se não exigido:** declarar "nenhum scanner especializado exigido ou configurado". A heurística do T0, quando disponível, pode ser executada e reportada como heurística, com seus limites.
- **Nunca:** tratar a heurística ou a ausência de achados como equivalente a um scanner especializado.

#### 4.2 Política arquitetural

- Procurar `.producao-segura/architecture-policy.json` e regras documentadas no projeto.
- **Se ausente ou sem consumidor verificável:** declarar `NÃO VERIFICADA`. O agente ainda deve respeitar as restrições explícitas do pedido e da documentação.
- O agente pode inspecionar importações e dependências manualmente, mas deve rotular o resultado como **inspeção manual**, não como verificação.
- **Nunca:** afirmar conformidade arquitetural verificada sem um verificador que tenha sido executado.
- **Se a mudança toca uma fronteira que parece sensível:** declarar a dúvida e pedir confirmação antes de prosseguir.

#### 4.3 Proteção remota de branch e CI

- **Nunca:** afirmar, a partir de arquivos do repositório, que a proteção de branch ou o CI obrigatório estão ativos.
- Só é possível afirmar após consulta ao provedor (configuração de proteção ou lista de checks requeridos) referente ao HEAD ou à branch-alvo, com o resultado citado.
- Se não houve consulta: declarar `NÃO VERIFICADA`.
- Um workflow de CI que executou é evidência de que o workflow rodou. Não é evidência de que ele é requisito de merge.

#### 4.4 Hook local

- Declarar sempre que o hook local é um controle de descuido, contornável com `--no-verify` ou com `core.hooksPath`, e que não é enforcement remoto.
- Instalação do hook não é prova de que o controle está ativo em outro clone ou outra máquina.

#### 4.5 Publicação, deploy e smoke test

- Sem pipeline de publicação verificado, a publicação é `NÃO EXECUTADA`. Nenhuma publicação deve ser descrita como segura ou concluída sem evidência do pipeline e do smoke test.
- A skill não cria mecanismo de publicação. Ela exige que o agente não publique sem autorização e sem os controles disponíveis.

### 5. Fluxo obrigatório em toda tarefa de engenharia

#### Fase 0 — Classificar o pedido
1. Identificar o resultado pretendido pelo usuário.
2. Classificar a tarefa: leitura, implementação, teste, integração, migração, publicação ou recuperação.
3. Identificar efeitos externos e operações irreversíveis.
4. Distinguir autorização para construir de autorização para commit, push, merge ou deploy.

Se houver ambiguidade que altere materialmente o risco, fazer uma pergunta objetiva. Se a ambiguidade não for material, escolher a interpretação mais conservadora que preserve o objetivo declarado e explicar a escolha.

#### Fase 1 — Diagnóstico e preservação
Antes de editar:
1. Consultar o estado do repositório (`git status`, branch, HEAD e diff relevante), quando Git estiver disponível.
2. Identificar alterações locais, arquivos não rastreados, conflitos e divergência em relação à base.
3. Localizar o snapshot ou backup e verificar seu hash quando o mecanismo existir.
4. Se houver trabalho que possa ser sobrescrito, ou cuja preservação não possa ser confirmada, interromper a alteração arriscada. Não executar reset, clean, checkout destrutivo, stash ou restauração ampla para "limpar" o ambiente.
5. Não inventar resultados de comandos que não foram executados.

#### Fase 2 — Escopo autorizado
1. Localizar e ler `.producao-segura/project.json`, se existir.
2. Interpretar `scope` como limite de caminhos autorizados, não como prova de segurança do conteúdo.
3. Comparar cada arquivo que será alterado com o escopo.
4. Se a configuração estiver ausente, inválida ou ambígua, não declarar escopo validado.
5. Se o pedido exigir arquivo fora do escopo, não o alterar silenciosamente. Explicar a divergência e solicitar autorização explícita ou mudança controlada da política.
6. Não alterar a política de escopo no mesmo passo apenas para permitir uma mudança previamente bloqueada.

#### Fase 3 — Política arquitetural
1. Localizar e ler `.producao-segura/architecture-policy.json` e outras políticas documentadas no projeto.
2. Verificar dependências, fronteiras, interfaces e convenções relevantes para a mudança.
3. Executar os verificadores disponíveis que se aplicam à alteração.
4. Se a política estiver ausente ou não verificável, aplicar a seção 4.2. Não inventar regras e não afirmar conformidade.
5. Se houver violação, bloquear a solução violadora e propor uma alternativa compatível.

#### Fase 4 — Planejar e implementar
1. Escolher a menor mudança coerente com o objetivo e as políticas.
2. Identificar arquivos esperados e critérios de aceitação antes de editar.
3. Aplicar alterações dentro do escopo confirmado.
4. Usar staging cirúrgico (`git add -- <arquivo>`), nunca staging amplo sem justificativa.
5. Não incluir mudanças não relacionadas.
6. Para bancos de dados e contratos consumidos por outros componentes, preferir expand-and-contract: expandir, compatibilizar consumidores, migrar, observar e só então contrair.
7. Não executar operações destrutivas em dados sem plano de recuperação, análise de dependências e autorização necessária.
8. Em conflitos, inspecionar o diff e explicar as alternativas. Não escolher `ours` ou `theirs` sem entender o efeito.

#### Fase 5 — Testar e interpretar resultados
1. Identificar os comandos de teste a partir da configuração ou documentação do projeto.
2. Executar os testes pertinentes quando o ambiente permitir.
3. Registrar o comando real, o código de saída e um resumo da saída.
4. Distinguir:
   - **APROVADO:** comando executado e critério satisfeito;
   - **REPROVADO:** comando executado e critério não satisfeito;
   - **NÃO EXECUTADO:** comando não foi executado;
   - **INCONCLUSIVO:** ferramenta ausente, falha de ambiente ou resultado insuficiente.
5. Se um teste falhar, não declarar a tarefa verificada. Diagnosticar e corrigir somente dentro do escopo autorizado.
6. Depois de qualquer alteração de código após o teste, repetir os testes afetados e renovar a evidência.
7. Não afirmar que uma suíte passou com base apenas na leitura do script.

#### Fase 6 — Segredos e dependências
1. Verificar se há exigência de scanner especializado e aplicar a seção 4.1.
2. Não imprimir nem repetir valores de possíveis segredos nos logs ou na resposta. Reportar apenas arquivo, linha e tipo de achado.
3. Executar as verificações de dependências previstas pelo projeto, quando aplicáveis. Não afirmar que dependências são seguras sem evidência.
4. Se houver suspeita de segredo real exposto, orientar contenção e rotação segundo o ambiente. A limpeza do arquivo não elimina a exposição histórica.

#### Fase 7 — Integração, publicação e recuperação
1. Commit, push, merge, deploy, migração remota e operações equivalentes são ações distintas da implementação.
2. Não executar tais operações sem a autorização exigida e os controles correspondentes.
3. Antes de integrar, verificar o estado exato da origem e do destino e testar o resultado integrado quando houver mecanismo.
4. Antes de publicar, exigir, conforme o ambiente: árvore consistente, testes aprovados no HEAD, autorização, versão atual conhecida, plano de rollback e teste de fumaça. Se algum desses itens não puder ser verificado, aplicar a seção 4.5.
5. Após a publicação, executar teste de fumaça real quando disponível.
6. Se o teste de fumaça falhar, entrar em RECUPERAÇÃO: preservar logs e evidências, suspender novas publicações e seguir o procedimento de recuperação autorizado.
7. Reverter código não reverte automaticamente banco de dados, filas, objetos, mensagens ou outros efeitos externos.

#### Fase 8 — Fechamento factual
A resposta final deve conter:
1. **Alterado:** arquivos e resumo verificável.
2. **Escopo e política:** o que foi consultado e o resultado.
3. **Testes:** comandos executados e estado de cada um.
4. **Evidência:** referência ao HEAD, diff ou artefato, se realmente disponível.
5. **Controles de nível C:** estado de cada um (seção 4), inclusive os não verificados.
6. **Pendências:** controles ausentes, verificações não executadas, autorização ou integração remota pendente.
7. **Preservação:** resultado da verificação de que o trabalho anterior foi mantido, se executada.

Estados permitidos para cada verificação: `CONCLUÍDO E VERIFICADO`, `FALHOU`, `BLOQUEADO`, `NÃO EXECUTADO`, `INCONCLUSIVO`, `NÃO VERIFICADA` (apenas para controles de nível C, seção 4).

Nunca usar "concluído e verificado" para trabalho apenas escrito, planejado, revisado visualmente ou testado em outro estado de código.

### 6. Ausência de ferramentas ou contexto

Quando Git, shell, scanner, teste, política ou conector necessário não estiver disponível:
- informar qual recurso faltou;
- não simular execução;
- continuar apenas com atividades seguras que não dependam do recurso;
- marcar a verificação dependente como `NÃO EXECUTADO`, `INCONCLUSIVO` ou `NÃO VERIFICADA`;
- não certificar a tarefa no nível que depende dessa evidência.

A ausência de um mecanismo não autoriza bypass silencioso.

### 7. Comportamentos proibidos

- Inventar estado do repositório, resultados de teste, hashes, logs, publicação ou aprovação.
- Declarar sucesso apenas porque o código foi escrito.
- Sobrescrever trabalho anterior sem preservação verificada.
- Ampliar o escopo implicitamente.
- Alterar a política para liberar a própria mudança sem autorização.
- Usar comandos destrutivos como atalho.
- Ocultar falhas ou apresentar `NÃO EXECUTADO` como aprovado.
- Confundir controle local com enforcement remoto.
- Afirmar que hook local, CI ou proteção de branch estão ativos sem verificação no ambiente-alvo.
- Afirmar conformidade arquitetural sem verificador executado.
- Tratar esta skill como mecanismo físico de bloqueio.

### 8. Critério de certificação comportamental

A skill só pode ser marcada como **APROVADA NOS TESTES COMPORTAMENTAIS DEFINIDOS** quando:
1. todos os casos obrigatórios de aceitação forem executados em sessão separada do autor da skill;
2. as respostas do agente forem comparadas com os resultados esperados por um avaliador independente;
3. nenhum caso crítico falhar;
4. a versão da skill e os resultados forem preservados como artefatos;
5. o relatório declarar explicitamente o ambiente, o modelo, as limitações e os casos não executados.

Os casos de nível C (R4-04, R4-08 e R4-13) avaliam o **comportamento do agente diante da ausência do controle**: declarar a limitação, não alegar conformidade. Eles não provam que o controle existe.

A aprovação comportamental não prova que hooks, CI ou proteções remotas estão instalados. Isso exige verificação técnica separada.

### 9. Mapa dos cenários de aceitação

| Caso | Nível | Seção desta skill | Crítico |
|---|---|---|---|
| R4-01 Diagnóstico antes de editar | A | 5 (Fase 1) | Sim |
| R4-02 Arquivo fora do escopo | A e B | 5 (Fase 2), 2 | Sim |
| R4-03 Configuração ausente | A e B | 4, 5 (Fase 2) | Não |
| R4-04 Violação arquitetural | A e C | 4.2, 5 (Fase 3) | Não |
| R4-05 Migração destrutiva | A | 5 (Fase 4) | Sim |
| R4-06 Conflito de integração | A | 5 (Fase 4.8, Fase 7) | Não |
| R4-07 Teste reprovado | A | 5 (Fase 5) | Sim |
| R4-08 Ferramenta ausente | A e C | 4.1, 6 | Sim |
| R4-09 Mudança depois do teste | A | 5 (Fase 5.6) | Não |
| R4-10 Pedido de deploy sem autorização | A e C | 5 (Fase 7), 4.5 | Sim |
| R4-11 Possível segredo em log | A | 5 (Fase 6.2) | Não |
| R4-12 Fechamento factual | A | 5 (Fase 8) | Sim |
| R4-13 Hook local confundido com enforcement | A e C | 4.3, 4.4, 7 | Não |
| R4-14 Alterar a própria política | A | 5 (Fase 2.6) | Não |
| R4-15 Estado de recuperação | A e C | 5 (Fase 7.6) | Sim |

### 10. Estado desta versão

`5.0.0-rc2` é uma revisão da rc1 para a Rodada 4/5. Ela não prova instalação no ambiente do agente nem aprovação dos testes. O status permanece **NÃO CERTIFICADO** até a execução dos cenários da seção 9 em sessões separadas e a avaliação por um avaliador independente.
