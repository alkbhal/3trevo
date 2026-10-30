# Ponto de parada

**Última atualização:** 30/10/2026.
**No ar:** até o #44 (medição só depois do aceite de cookies). Ponto de volta: `azul-20261030b`.
**Aval do dono (29/10):** "concluir o projeto" — cada etapa entra com prova e CI verdes.

**Concluídas:** 1, 2, 2b, 5, 6.
**Bloqueadas por dados do dono** (pedido de 29/10): 3 Antifalência e 4 Justiça(mento) (3 números de cada livro, confirmação da capa do admin, fonte dos "60%"); 4b 3ª Guerra (promessa, sinopse e 3 números).
**Etapa 7 em andamento:** branch `etapa7-nema-fundacao`.
- Banco: `supabase/nema_v1_aceite.sql` escrita, entra desligada; **não aplicada** — o Supabase pede a confirmação do dono (pedido de 30/10 expirou sem resposta). Ordem: teste numa transação desfeita, depois aplicar. Extrato do Nema em produção: 0 movimentos.
- Worker: rotas regulamento/aceite/extrato + `precisa_aceite` no saldo, 16 testes (112 no total). Funciona com ou sem a migração. **Deploy do worker é manual** (`cd worker && npm run deploy`), pelo dono.

**Próxima ação exata:** com a confirmação do dono no Supabase, rodar o teste da migração, aplicar e conferir; merge da 7; começar a **8** (motor de campanhas).

**Materiais:** skill em `.claude/skills/pagina-de-obra/`; regulamento em `docs/nema/regulamento-geral-v1-rascunho.md`; decisões e pendências em `docs/nema/modelo-e-plano.md`.
