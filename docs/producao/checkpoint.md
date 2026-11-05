# Ponto de parada

**Última atualização:** 05/11/2026.
**No ar:** #31 a #34, #38 e #43 (vídeo leve da home). Ponto de volta: `azul-20261030`.
**Aval do dono (29/10):** "concluir o projeto" — cada etapa entra com prova e CI verdes.

**Concluídas:** 1, 2, 2b, 5.
**Bloqueadas por dados do dono** (pedido de 29/10): 3 Antifalência e 4 Justiça(mento) (3 números de cada livro, confirmação da capa do admin, fonte dos "60%"); 4b 3ª Guerra (promessa, sinopse e 3 números).
**Etapa 6 em andamento:** branch `etapa6-medidor-consentimento`: `js/beacon.js` só mede depois do aceite; recusa apaga o `_tt_anon`; aviso de cookies e política (PT/EN/ES) citam a medição própria; páginas de obra medem sem pop-up e marcam a versão.

**Etapa 14 entregue (05/11):** branch `ccr-5190060b-xn0cyu` (3trevo e tr3vo-forge). Livro revisado e ampliado (`tr3vo-forge/docs/obras/livre-das-dividas/edicao-2026-11.md`, gerador `gerar-leitura.py`); leitor gamificado com amostra pública (prefácio, cap. 1 e 2) e capítulos pagos via `/api/leitura/livre-das-dividas`; tabela `obra_conteudo` criada e carregada em produção (11 capítulos pagos, hash conferido, sem leitura anon/authenticated); app Ático em `atico/app.html`. Produto `atico-plano` segue **inativo** no banco (R$ 19,90): o plano pago do Ático só vende quando o dono ativar.
Para nova edição do livro: editar o `.md` no forge → `python3 gerar-leitura.py ../../../../3trevo` → aplicar `seed-obra-conteudo.sql` no Supabase.

**Próxima ação exata:** merge da 6 e começar a **etapa 7** (Nema fase 1 — fundação).

**Materiais:** skill em `.claude/skills/pagina-de-obra/`; regulamento em `docs/nema/regulamento-geral-v1-rascunho.md`; decisões e pendências em `docs/nema/modelo-e-plano.md`.
