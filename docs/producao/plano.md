# Linha de produção — conclusão da `skill-pagina-de-obra` e frentes ligadas

Regra da linha (dono, 27/10/2026): nada fica inacabado. Uma etapa por vez, cada uma com entrega concreta. Pausa só no fim de um passo, com o ponto de parada escrito em `checkpoint.md`; a retomada começa exatamente dali. Demanda nova que surgir no caminho entra nesta fila como etapa e é executada na vez dela — não fica solta.

## Ciclo de cada etapa
1. **Entrada:** ler `checkpoint.md`, conferir `main` e a branch, confirmar o objetivo e os critérios de aceitação da etapa.
2. **Construção:** branch própria a partir do `main`, só o escopo da etapa.
3. **Prova:** checks do CI (`stamp`, `i18n --check`, `site-check`, worker) + a prova da etapa, com evidência (passou / falhou / não conferido).
4. **PR:** descrição com o que muda, como foi testado e o que não deu para conferir.
5. **Aval do dono** → marcar `azul-AAAAMMDD` → merge → conferir "Verificação pós-deploy".
6. **Checkpoint:** atualizar `checkpoint.md` (etapa concluída, commit, próxima etapa).

## Fila
| # | Etapa | Entrega concreta | Critério de pronto | Depende de |
|---|---|---|---|---|
| 1 | Fechar a skill | PR da branch `skill-pagina-de-obra` → `main` (skill, regulamento-rascunho, plano; nada vai ao site) | skill carregável em qualquer sessão; site inalterado | aval |
| 2 | Isa, Isma e Tintim no padrão clean | PR com `obra/isa-isma-tintim.html` | prova da skill com 0 falhas; números da ficha conferidos no livro | etapa 1 |
| 3 | Antifalência no padrão clean (hoje sem capa real) | PR | idem; capa real ou etapa de capa registrada | etapa 1 |
| 4 | Justiça(mento) no padrão clean (hoje sem capa real) | PR | idem | etapa 1 |
| 5 | Vídeo da home (7,5 MB tocando sozinho no celular) | PR: versão leve ou pôster no celular | prova: nenhum vídeo automático > 1 MB; home sem regressão | — |
| 6 | Medidor próprio respeitando os cookies | PR em `js/beacon.js` + carregar nas páginas de obra | sem evento nem `_tt_anon` antes do aceite; com recusa, página funcional e sem medição; eventos marcam a versão vista | — |
| 7 | Nema fase 1 — fundação | PR: versões do regulamento, aceite (versão, data e hora, participante), histórico, liga/desliga; uso e geração de Nema exigem aceite; consulta livre | migração aditiva aplicada; saldos intactos (conferido antes/depois); testes do worker; gate N2 | — |
| 8 | Nema fase 2 — motor de campanhas | PR: ficha com os 10 campos; compra de e-book como campanha permanente; crédito único por atividade | testes de geração, limites, validade, combinação | 7 |
| 9 | Nema fase 3 — interfaces e comunicação | PR: aceite e extrato na área do cliente; admin de regulamento e campanhas; home, `nema.html`, checkout e EN/ES sem "Nema = desconto"; símbolo C (principal, mono, claro/escuro, vetor) | `i18n --check`; site-check; prova das telas | 8 + regulamento revisado pelo jurídico |
| 10 | Nema fase 4 — validação | relatório de evidências: aceite, recusa, saldo preexistente, mudança de campanha, contestação, encerramento, falhas | todos os fluxos com evidência | 9 |
| 11 | Teste clean × suave | variante sorteada nas obras + leitura dos critérios | mínimo de visitas/vendas por versão definido antes; decisão registrada | 6 |
| 12 | Esteira forge → site | nota de mercado visível no admin, slug legível, biblioteca de manuscritos etiquetados | definida no início da etapa | repositório do forge |
| 13 | Skill de capa (forge) | skill própria | idem | repositório do forge |

**Em paralelo, fora do código:** revisão jurídica do Regulamento v1 (3 marcas [JURÍDICO]) — bloqueia só a publicação da etapa 9.
