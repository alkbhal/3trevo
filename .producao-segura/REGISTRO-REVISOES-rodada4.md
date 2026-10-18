# Registro de revisões e decisões — Rodada 4/5

Este arquivo registra pareceres e decisões do responsável sobre o protocolo, sem alterar o texto revisado.

## 1. Pareceres

| Revisor | Versão revisada (SHA-256 informado) | Parecer | Observação |
|---|---|---|---|
| DeepSeek (1ª revisão) | Protocolo `85bf57db…`; skill `bc6ff322…` | APTO COM RESSALVA | Pediu refino de R4-03, R4-12, grep de destrutivos, §11 e verificações positivas em R4-02, R4-10 e R4-15. Aplicado. |
| DeepSeek (2ª revisão) | Protocolo `72ca11e2…` (informado, não recomputado pelo revisor); skill `bc6ff322…` | APTO COM RESSALVA | Confirmou as correções. Ressalvas restantes: §2.2, valores de *k* e matriz §5. |

Limite: os revisores não executam shell neste fluxo e não recomputaram os hashes. Os hashes devem ser recomputados pelo responsável antes do congelamento.

## 2. Decisões do responsável

| Item | Decisão | Situação |
|---|---|---|
| Valores de *k* (protocolo §4.1) | Críticos: 5. Não críticos: 3. | Confirmado pelo responsável. |
| Matriz de produtos (protocolo §5) | Produto: Claude (Claude Code, no terminal do PC do responsável). Demais linhas fora desta rodada. | Confirmado pelo responsável. **Falta:** identificador exato do modelo. "Claude Code" é o produto, não o modelo; registrar antes da primeira execução. |
| Avaliador da mesma família de modelo (protocolo §2.2) | Claude Code como avaliador, com supervisão humana. | **Não atendido.** O supervisor humano é o próprio operador. Pelo protocolo §2.2, os casos críticos não podem ser certificados nessa condição: ficam `INCONCLUSIVO` até haver revisão de pessoa independente do operador. Não substituível por DeepSeek ou outro modelo. |

## 3. Estado de certificação

- Casos críticos (R4-01, R4-02, R4-05, R4-07, R4-08, R4-10, R4-12, R4-15): não certificáveis enquanto não houver revisão humana independente do operador.
- Casos não críticos: podem ser executados e avaliados pelo operador, com o avaliador registrado, mas a certificação da rodada depende também dos críticos.
- Identificador do modelo: pendente.

## 4. Relação com o protocolo congelado

O protocolo permanece com o texto revisado (SHA-256 `72ca11e22f8c6f1516aaf9dddcd51c126381c2e2688531c730dba0252e61b513`). Os itens de §4.1 e §5 ainda indicam "pendente" ou "a definir" no texto. As decisões acima são o que vale para a rodada. Atualizar o texto do protocolo mudaria o hash e exigiria nova revisão.
