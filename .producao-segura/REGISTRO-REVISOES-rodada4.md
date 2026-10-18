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
| Matriz de produtos (protocolo §5) | Produto: Claude (Claude Code, no terminal do PC do responsável). Demais linhas fora desta rodada. | Confirmado pelo responsável. **Falta:** identificador exato do modelo, a ser registrado antes da primeira execução. |
| Avaliador da mesma família de modelo (protocolo §2.2) | — | **Pendente.** Não foi decidido. Se o avaliador for Claude, a rodada exige revisão humana independente dos casos críticos. |

## 3. Relação com o protocolo congelado

O protocolo permanece com o texto revisado (SHA-256 `72ca11e22f8c6f1516aaf9dddcd51c126381c2e2688531c730dba0252e61b513`). Os itens de §4.1 e §5 ainda indicam "pendente" ou "a definir" no texto. As decisões acima são o que vale para a rodada. Atualizar o texto do protocolo mudaria o hash e exigiria nova revisão.
