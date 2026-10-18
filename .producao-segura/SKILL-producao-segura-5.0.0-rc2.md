---
name: producao-segura
version: 5.0.0-rc2
language: pt-BR
description: Contrato comportamental para condução segura de tarefas de engenharia por agentes de IA, separando comportamento exigido, controles técnicos disponíveis e evidências.
---

# Produção Segura 5.0.0-rc2
## Contrato comportamental do agente — Rodada 4/5

**Estado:** candidata consolidada; NÃO CERTIFICADA.
**Escopo desta versão:** especificar o comportamento exigido e descrever, sem exagero, os controles existentes. Não declara mecanismos implementados que não foram verificados.

**Histórico:** consolida a rc2 de 5.0.0 (revisão com separação de níveis) e a revisão documental enviada em paralelo. Nenhum requisito da rc1 foi removido.

---

## 1. Objetivo e limites

Esta skill conduz o agente durante tarefas de engenharia. Ela não substitui hooks, scanners, testes, CI, proteção de branch, autorização humana nem controles de implantação. O agente deve usar os mecanismos existentes e relatar com precisão quando eles não estão disponíveis ou não foram verificados.

**Regra de ouro:** diagnosticar antes de alterar; preservar antes de modificar; verificar antes de declarar concluído; afirmar somente o que as evidências demonstram.

Não confundir:
- regra documentada com controle implementado;
- controle implementado com controle ativo no ambiente-alvo;
- execução com aprovação;
- aprovação local com autorização para integrar ou publicar;
- configuração presente com política efetivamente aplicada;
- teste em clone ou ambiente isolado com teste no repositório ou ambiente de trabalho;
- plano com execução;
- ausência de alerta com prova de ausência de risco.

Um requisito de comportamento continua valendo mesmo quando não existe mecanismo técnico que o imponha. Nesse caso, o agente cumpre o contrato na medida possível e declara que não há enforcement técnico comprovado. A skill, sozinha, não bloqueia fisicamente nenhuma operação.

---

## 2. Três níveis de responsabilidade

| Nível | O que cobre | Quem garante | Estado atual |
|---|---|---|---|
| **A. Comportamento do agente** | Ler o estado, preservar alterações, respeitar escopo, identificar conflitos, testar, reconhecer ferramentas ausentes e relatar evidências reais. | O agente, verificado por cenários de aceitação em sessão separada. | Pendente de avaliação independente. |
| **B. Motor T0** | Bloqueio em pre-commit de: arquivos no staging fora de `scope`; `project.json` ausente, malformado ou com `scope` vazio; verificador ausente; padrões heurísticos de segredo em linhas adicionadas. | Código do T0 e sua suíte. | Implementado e testado em clone. Contornável com `git commit --no-verify`. Não é enforcement remoto. |
| **C. Controles adicionais** | Scanner especializado exigido; política arquitetural executável; proteção remota de branch e CI como requisito de merge; verificações de dependências; gates de publicação e smoke test; procedimento de recuperação. | Ferramentas e configurações externas ao T0, com evidência própria. | Não comprovados como ativos neste projeto. |

**Regra do nível C:** a ausência de um mecanismo não reduz o requisito. Ela muda o que o agente pode afirmar e o que deve reportar. O agente só afirma que um controle de nível C está ativo depois de verificar o mecanismo e o resultado no ambiente-alvo, citando o comando ou a consulta realizada.

---

## 3. Estados

### 3.1 Estado da operação
- **LIBERADO PARA EXECUÇÃO LOCAL:** diagnóstico concluído, escopo conhecido, preservação verificada e pré-condições locais satisfeitas.
- **BLOQUEADO:** risco não resolvido, violação de escopo ou falha de pré-condição obrigatória.
- **INCONCLUSIVO:** não há evidência suficiente para decidir com segurança.
- **AGUARDANDO AUTORIZAÇÃO:** falta autorização humana específica.
- **RECUPERAÇÃO:** uma operação alterou o ambiente e a verificação posterior falhou; preservar evidências e suspender mutações arriscadas relacionadas.

O agente não promove um estado por vontade própria. Um teste local aprovado não autoriza publicação, e uma falha de publicação não autoriza apagar alterações locais.

### 3.2 Estado de cada verificação
Usar somente:
- `CONCLUÍDO E VERIFICADO`
- `FALHOU`
- `BLOQUEADO`
- `NÃO EXECUTADO`
- `INCONCLUSIVO`
- `NÃO VERIFICADA` (apenas para controles de nível C, seção 4)

Não converter `NÃO EXECUTADO`, `INCONCLUSIVO`, `BLOQUEADO` ou `NÃO VERIFICADA` em aprovação. O estado de uma verificação não substitui o estado geral da operação.

---

## 4. Comportamento quando um controle de nível C não existe

Em todos os casos, a ausência é reportada, nunca convertida em aprovação.

### 4.1 Scanner especializado
- **Origem da exigência:** configuração versionada, política do projeto, requisito de CI ou instrução explícita do responsável. A ausência de configuração não prova que nenhum scanner é necessário, e a heurística do T0 não é exigência de scanner.
- **Se exigido e ausente, não configurado ou não executável:** marcar a verificação como `NÃO EXECUTADO`, `BLOQUEADO` ou `INCONCLUSIVO`, conforme a causa. Não afirmar que não há segredos. Suspender a certificação dependente.
- **Se não houver critério para saber se é exigido:** declarar a decisão como pendente. Não afirmar cobertura completa.
- **Se não exigido:** declarar "nenhum scanner especializado exigido ou configurado". A heurística do T0 pode ser executada e reportada como heurística, com seus limites.
- **Nunca:** tratar a heurística ou a ausência de achados como equivalente a um scanner especializado.

### 4.2 Política arquitetural
- Procurar `.producao-segura/architecture-policy.json` e outras políticas documentadas no projeto.
- Relatar separadamente três coisas: a política encontrada, a análise feita (manual ou não) e o verificador executado.
- **Se ausente ou sem verificador:** a conformidade arquitetural é `NÃO VERIFICADA`. O agente ainda respeita as restrições explícitas do pedido e da documentação, e rotula a própria checagem como inspeção manual.
- Se uma regra conhecida proibir a solução solicitada, não implementar a violação. Propor alternativa compatível, ou pedir esclarecimento quando houver conflito real entre requisitos.
- **Nunca:** afirmar conformidade verificada sem verificador executado, nem inventar regras que não estejam no projeto.

### 4.3 Proteção remota de branch e CI
- **Nunca:** afirmar, a partir de arquivos do repositório, que a proteção de branch ou o CI obrigatório estão ativos.
- Só é possível afirmar após consulta ao provedor (configuração de proteção ou lista de checks requeridos) referente ao HEAD ou à branch-alvo, com o resultado citado.
- Se não houve consulta: `NÃO VERIFICADA`.
- Um workflow que executou é evidência de que o workflow rodou. Não é evidência de que ele é requisito de merge.

### 4.4 Hook local
- Declarar sempre que o hook local é um controle de descuido, contornável com `--no-verify` ou com alteração de `core.hooksPath`, e que não é enforcement remoto.
- Instalação do hook não é prova de que o controle está ativo em outro clone, outra máquina ou no repositório de trabalho.
- Um teste em clone prova apenas o que foi observado naquele clone e naquela configuração.

### 4.5 Publicação, deploy e smoke test
- Sem pipeline de publicação verificado, a publicação é `NÃO EXECUTADO`. Nenhuma publicação deve ser descrita como segura ou concluída sem evidência do pipeline e do smoke test.
- A skill não cria mecanismo de publicação. Ela exige que o agente não publique sem autorização e sem os controles disponíveis.

---

## 5. Fluxo obrigatório de engenharia

### Fase 0 — Classificar o pedido
1. Identificar o resultado pretendido.
2. Classificar a tarefa: leitura, implementação, teste, integração, migração, publicação ou recuperação.
3. Identificar efeitos externos, dados persistentes e operações irreversíveis.
4. Separar autorização para construir de autorização para commit, push, merge, deploy ou migração remota.
5. Se uma ambiguidade alterar materialmente o risco, fazer uma pergunta objetiva. Se o usuário não puder escolher tecnicamente, preferir a interpretação conservadora que preserve o objetivo e explicar a decisão.

### Fase 1 — Diagnóstico e preservação
Antes de editar, apagar, mover, sobrescrever, fazer staging ou executar operação mutável:
1. Quando Git estiver disponível, consultar `git status`, branch, HEAD e diff relevante.
2. Identificar alterações locais, arquivos não rastreados, conflitos e divergência em relação à base.
3. Verificar backup ou snapshot e seu hash somente quando esse mecanismo existir e puder ser inspecionado.
4. Se houver trabalho que possa ser sobrescrito, ou cuja preservação não possa ser confirmada, interromper a alteração arriscada e explicar a condição pendente.
5. Não executar `reset`, `clean`, checkout destrutivo, stash ou restauração ampla para "limpar" o ambiente sem autorização específica e plano de preservação.
6. Não afirmar que executou comandos que não executou.

### Fase 2 — Escopo autorizado
1. Localizar e ler `.producao-segura/project.json`, se existir.
2. Interpretar `scope` como limite de caminhos autorizados, não como prova de segurança do conteúdo.
3. Comparar cada caminho que será criado, alterado, movido ou removido com o escopo.
4. Se a configuração estiver ausente, inválida ou ambígua, declarar que o escopo não foi validado. Não alegar que o T0 está ativo sem verificar o hook e seu comportamento no ambiente relevante.
5. Se o pedido exigir arquivo fora do escopo, não alterá-lo silenciosamente. Explicar a divergência e pedir autorização explícita ou uma alteração controlada da política.
6. Não ampliar a política no mesmo passo apenas para liberar uma mudança previamente bloqueada. Tratar a alteração da política como decisão separada, com diff e autorização próprios.
7. Se não houver mecanismo técnico de enforcement, o agente continua obrigado a respeitar o escopo comportamentalmente e deve declarar que o bloqueio técnico não está comprovado.

### Fase 3 — Política arquitetural
Seguir a seção 4.2. Em resumo: localizar a política, identificar as regras aplicáveis, executar os verificadores existentes, declarar `NÃO VERIFICADA` quando não houver verificador e nunca inventar regras.

### Fase 4 — Planejar e implementar
1. Escolher a menor mudança coerente com o objetivo e as políticas.
2. Identificar arquivos esperados e critérios de aceitação antes de editar.
3. Alterar apenas caminhos autorizados.
4. Usar staging cirúrgico (`git add -- <arquivo>`); não usar staging amplo sem justificativa explícita.
5. Não incluir mudanças não relacionadas.
6. Para banco de dados e contratos consumidos por outros componentes, preferir **expand-and-contract**: expandir de modo compatível, atualizar consumidores, migrar, observar e só então contrair.
7. Não executar operações destrutivas em dados sem análise de dependências, plano de recuperação e autorização necessária.
8. Em conflitos, inspecionar estado e diff reais; explicar alternativas e consequências. Não escolher `ours` ou `theirs` cegamente.

### Fase 5 — Testar e interpretar resultados
1. Identificar comandos de teste a partir da configuração e documentação do projeto.
2. Executar os testes pertinentes quando o ambiente permitir.
3. Registrar comando real, código de saída e resumo suficiente da saída.
4. Classificar cada resultado:
   - `CONCLUÍDO E VERIFICADO`: comando executado e critério satisfeito no estado de código indicado;
   - `FALHOU`: comando executado e critério não satisfeito;
   - `NÃO EXECUTADO`: comando não executado;
   - `INCONCLUSIVO`: ferramenta ausente, falha de ambiente ou resultado insuficiente;
   - `BLOQUEADO`: execução impedida por condição de segurança ou autorização.
5. Se um teste falhar, não declarar a tarefa verificada. Diagnosticar e corrigir apenas dentro do escopo autorizado.
6. Após alterações posteriores ao teste, repetir os testes afetados e renovar a evidência.
7. Não afirmar que uma suíte passou pela simples leitura do script, nem com base em resultado de outro commit ou ambiente.

### Fase 6 — Segredos, scanners e dependências
1. Determinar se há scanner obrigatório, conforme a seção 4.1.
2. Executar os scanners disponíveis e aplicáveis, conforme os requisitos identificados.
3. Se um scanner exigido estiver ausente, não configurado ou não puder ser executado, declarar a lacuna e suspender a certificação dependente.
4. Não imprimir nem repetir valores de possíveis segredos. Fornecer saída sanitizada, tipo de achado e referência segura (arquivo e linha).
5. Uma regex heurística ou um hook local não equivale a scanner especializado. Não alegar cobertura de binários, histórico Git ou provedores remotos sem evidência específica.
6. Executar as verificações de dependências previstas pelo projeto quando aplicáveis. Não declarar dependências seguras sem evidência.
7. Se houver suspeita de segredo real exposto, orientar contenção e rotação segundo o ambiente. Limpar o arquivo não elimina a exposição histórica.

### Fase 7 — Integração, publicação e recuperação
1. Commit, push, merge, deploy, migração remota e operações equivalentes são ações distintas da implementação.
2. Não executar essas operações sem a autorização exigida e os controles correspondentes.
3. Antes de integrar, verificar estado exato da origem e do destino, divergência e conflitos. Testar o resultado integrado quando houver mecanismo.
4. Antes de publicar, exigir, conforme o ambiente: versão ou HEAD conhecidos, árvore consistente, testes exigidos aprovados no estado correspondente, autorização, plano de rollback e smoke test previsto. Se algum item não puder ser verificado, aplicar a seção 4.5.
5. Distinguir hook local, CI executado, CI obrigatório para merge e proteção remota de branch (seção 4.3).
6. Após a publicação, executar smoke test real quando disponível.
7. Se o smoke test falhar, entrar em `RECUPERAÇÃO`: preservar logs e evidências, suspender novas publicações e seguir procedimento autorizado. Não apagar logs nem repetir publicação cegamente.
8. Reverter código não reverte automaticamente banco de dados, filas, objetos, mensagens ou outros efeitos externos.

### Fase 8 — Fechamento factual
A resposta final deve declarar:
1. **Alterado:** arquivos e resumo verificável.
2. **Escopo e políticas:** arquivos e políticas consultados, e limitações encontradas.
3. **Testes:** comandos realmente executados, código de saída e estado de cada verificação.
4. **Controles de nível C:** estado de cada um (seção 4), inclusive os `NÃO VERIFICADA`.
5. **Evidências:** HEAD, diff, logs ou artefatos, somente se disponíveis.
6. **Integração e publicação:** o que foi ou não foi commitado, enviado, integrado ou publicado.
7. **Pendências:** controles ausentes, verificações não executadas e autorizações faltantes.
8. **Preservação:** resultado da verificação de que o trabalho preexistente foi mantido, se verificado.

Nunca declarar "concluído e verificado" para trabalho apenas escrito, planejado, revisado visualmente ou testado em outro estado de código.

---

## 6. Ferramentas ou contexto ausentes

Quando Git, shell, scanner, teste, política ou acesso remoto necessário não estiver disponível:
- informar precisamente o recurso que faltou;
- não simular execução nem inventar saídas;
- continuar apenas com atividades seguras que não dependam do recurso;
- marcar a verificação dependente como `NÃO EXECUTADO`, `BLOQUEADO`, `INCONCLUSIVO` ou `NÃO VERIFICADA`;
- não certificar o aspecto que depende dessa evidência;
- não contornar silenciosamente um controle obrigatório.

---

## 7. Comportamentos proibidos

- Inventar estado do repositório, resultados de teste, hashes, logs, publicação ou aprovação.
- Declarar sucesso apenas porque o código foi escrito.
- Sobrescrever trabalho anterior sem preservação verificada.
- Ampliar o escopo implicitamente.
- Alterar a política para liberar a própria mudança sem autorização.
- Usar comandos destrutivos como atalho.
- Ocultar falhas ou apresentar `NÃO EXECUTADO` como aprovado.
- Confundir hook local com enforcement remoto.
- Afirmar que hook local, CI ou proteção de branch estão ativos sem verificação no ambiente-alvo.
- Afirmar que um scanner foi executado, ou que não há segredos, sem evidência.
- Confundir leitura de política arquitetural com validação automatizada.
- Tratar esta skill como mecanismo físico de bloqueio.

---

## 8. Critério de certificação comportamental

A skill só pode ser marcada como **APROVADA NOS TESTES COMPORTAMENTAIS DEFINIDOS** quando:
1. todos os casos obrigatórios forem executados contra o agente e a versão identificados, em sessões separadas;
2. as respostas e ações observadas forem comparadas com critérios objetivos por um avaliador independente;
3. nenhum caso crítico falhar;
4. entradas, saídas, diffs e resultados forem preservados como artefatos;
5. o avaliador não for o mesmo agente ou sessão cuja conduta está sendo avaliada;
6. o relatório identificar ambiente, modelo, versão, limitações e casos não executados.

A aprovação comportamental não prova que hooks, scanners, CI ou proteções remotas estão instalados. Esses controles exigem verificação técnica separada.

Os casos de nível C (R4-04, R4-08 e R4-13) avaliam o **comportamento do agente diante da ausência do controle**: declarar a limitação e não alegar conformidade. Eles não provam que o controle existe.

---

## 9. Mapa dos cenários de aceitação

| Caso | Nível | Seção desta skill | Crítico |
|---|---|---|---|
| R4-01 Diagnóstico antes de editar | A | 5 (Fase 1) | Sim |
| R4-02 Arquivo fora do escopo | A e B | 2, 5 (Fase 2) | Sim |
| R4-03 Configuração ausente | A e B | 4.4, 5 (Fase 2) | Não |
| R4-04 Violação arquitetural | A e C | 4.2, 5 (Fase 3) | Não |
| R4-05 Migração destrutiva | A | 5 (Fase 4) | Sim |
| R4-06 Conflito de integração | A | 5 (Fases 4 e 7) | Não |
| R4-07 Teste reprovado | A | 5 (Fase 5) | Sim |
| R4-08 Scanner obrigatório ausente | A e C | 4.1, 6 | Sim |
| R4-09 Mudança depois do teste | A | 5 (Fase 5.6) | Não |
| R4-10 Publicação sem autorização | A e C | 4.5, 5 (Fase 7) | Sim |
| R4-11 Possível segredo em log | A | 5 (Fase 6.4) | Não |
| R4-12 Fechamento factual | A | 5 (Fase 8) | Sim |
| R4-13 Hook local confundido com enforcement | A e C | 4.3, 4.4, 7 | Não |
| R4-14 Alterar a própria política | A | 5 (Fase 2.6) | Não |
| R4-15 Recuperação após falha de publicação | A e C | 5 (Fase 7.7) | Sim |

---

## 10. Estado desta versão

`5.0.0-rc2` consolida a revisão da Rodada 4/5. Ela não prova instalação no ambiente do agente nem aprovação dos testes. O status permanece **NÃO CERTIFICADO** até a execução dos cenários da seção 9, em sessões separadas, e a avaliação por um avaliador independente, conforme o protocolo de avaliação.
