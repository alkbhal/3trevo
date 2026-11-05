# Ponto de parada

**Última atualização:** 05/11/2026.
**No ar:** #31 a #34, #38 e #43 (vídeo leve da home). Ponto de volta: `azul-20261030`.
**Aval do dono (29/10):** "concluir o projeto" — cada etapa entra com prova e CI verdes.

**Concluídas:** 1, 2, 2b, 5.
**Bloqueadas por dados do dono** (pedido de 29/10): 3 Antifalência e 4 Justiça(mento) (3 números de cada livro, confirmação da capa do admin, fonte dos "60%"); 4b 3ª Guerra (promessa, sinopse e 3 números).
**Etapa 6 em andamento:** branch `etapa6-medidor-consentimento`: `js/beacon.js` só mede depois do aceite; recusa apaga o `_tt_anon`; aviso de cookies e política (PT/EN/ES) citam a medição própria; páginas de obra medem sem pop-up e marcam a versão.

**Etapa 14 entregue (05/11), com fontes canônicas únicas:**
- **Texto do livro:** só o Doc "Livre das Dívidas — texto canônico" (Drive › Livre das Dívidas › Canônico). Pasta limpa: Canônico / Publicado (PDF vendido, ainda não derivado do canônico) / Histórico. Nenhum repositório guarda o texto.
- **Publicação do texto:** `obra_conteudo` no Supabase, com `acesso` livre (prefácio, cap. 1 e 2) ou compra. O forge deriva: exportar o Doc → `python3 scripts/obras/gerar-leitura.py livre-das-dividas <export> <saida.sql>` → aplicar. O site lê só por `/api/leitura/livre-das-dividas`.
- **Motor do Ático:** o SFDTT (repositório alkbhal/SFDTT, branch v8). `js/sfdtt/` é cópia sem edição com `sfdtt.lock.json`; `worker/tests/sfdtt-deriva.test.ts` quebra se alguém editar. Atualizar: `node scripts/sfdtt-sync.mjs <clone SFDTT> origin/v8`. `js/sfdtt-motor.js` é só adaptador + fórmulas do livro.
- **Plano pago do Ático:** só no SFDTT (finintel.com.br). O produto `atico-plano` do site fica inativo e não é usado.
- **Divergências a decidir no SFDTT:** reserva inicial (livro R$ 300–500 × R-RESERVA R$ 1.000) e salário mínimo da guarda de subsistência (SM 2025 = R$ 1.518 no motor; 2026 = R$ 1.621).

**Próxima ação exata:** merge da 6 e começar a **etapa 7** (Nema fase 1 — fundação).

**Materiais:** skill em `.claude/skills/pagina-de-obra/`; regulamento em `docs/nema/regulamento-geral-v1-rascunho.md`; decisões e pendências em `docs/nema/modelo-e-plano.md`.
