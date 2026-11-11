# Ponto de parada

**Última atualização:** 11/11/2026.
**No ar:** #31 a #34, #38 e #43 (vídeo leve da home). Ponto de volta: `azul-20261030`.
**Aval do dono (29/10):** "concluir o projeto" — cada etapa entra com prova e CI verdes.

**Concluídas:** 1, 2, 2b, 5.
**Bloqueadas por dados do dono** (pedido de 29/10): 3 Antifalência e 4 Justiça(mento) (3 números de cada livro, confirmação da capa do admin, fonte dos "60%"); 4b 3ª Guerra (promessa, sinopse e 3 números).
**Etapa 6 em andamento:** branch `etapa6-medidor-consentimento`: `js/beacon.js` só mede depois do aceite; recusa apaga o `_tt_anon`; aviso de cookies e política (PT/EN/ES) citam a medição própria; páginas de obra medem sem pop-up e marcam a versão.

**Etapa 14 entregue (05/11):** branch `ccr-5190060b-xn0cyu` (3trevo e tr3vo-forge). Livro revisado e ampliado (`tr3vo-forge/docs/obras/livre-das-dividas/edicao-2026-11.md`, gerador `gerar-leitura.py`); leitor gamificado com amostra pública (prefácio, cap. 1 e 2) e capítulos pagos via `/api/leitura/livre-das-dividas`; tabela `obra_conteudo` criada e carregada em produção (11 capítulos pagos, hash conferido, sem leitura anon/authenticated); app Ático em `atico/app.html`. Produto `atico-plano` segue **inativo** no banco (R$ 19,90): o plano pago do Ático só vende quando o dono ativar.
Para nova edição do livro: editar o `.md` no forge → `python3 gerar-leitura.py ../../../../3trevo` → aplicar `seed-obra-conteudo.sql` no Supabase.

**Esteira da editora (11/11):** plano dos 7 setores + gestor em `docs/producao/esteira-editora.md`, branch `esteira-editora-plano`; etapas 15 a 20 entraram na fila. Retrato medido: 14 pessoas no site em 30 dias, 0 com origem identificada, 1 pagamento aprovado desde o início, que é teste do dono (0 vendas a desconhecidos).

**11/11, com aval do dono:** Antifalência retirado da vitrine (`products.ativo=false`; `catalogo` já estava falso). Motivo: PDF à venda é o de março e traz o nome civil na capa. Texto canônico apontado pelo dono: Drive, pasta da obra → Manuscritos (lido o Doc "Anti Falência v1", de abril). Plano em versão 2.0 (portões P1 a P5, etapas 0 a 5).

**Construção iniciada (11/11, dono em modo "só no vermelho"):**
- Primeiro livro da esteira: **Livre das Dívidas** (decisão do dono).
- Laudo: P1 verde; **P2 vermelho** (depósito guarda PDF/EPUB de 16/08, versão curta; a edição 2026-11 só está em `obra_conteudo`); **P3 vermelho** (`catalogo.ativo=false`: checkout responde "indisponível"); P4 não testado.
- A loja e o checkout leem `catalogo`, não `products`. Vendáveis hoje: 3ª Guerra, Isa Isma e Tintim, A Última Coisa (sem EPUB; preço 35,00 no catálogo × 76,74 em products).
- PR **tr3vo-forge#16**: `scripts/obras/compor.py` + workflow "Compor obra" (texto publicado → EPUB/PDF/manifest, portões P1 e P2). Testado com a amostra pública.
- PR **3trevo#67**: funil na página da obra + checkout por obra. Prova da skill: 48 passaram; a 1 que falhou compara o texto com a versão anterior (mudança intencional).
- Proteção do `main`: a API recusou a escrita por esta sessão; fica com o dono (Settings → Rules).
- Drive: pasta "Administração Autônoma Editora Tr3vo" (Painel, Fila do Vermelho, Obras, Setores, Planos, Erros).

**Próxima ação exata (depende do dono, ver Fila do Vermelho no Drive):** aval dos PRs → 3 secrets no forge (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `TERMOS_VETADOS`) → rodar "Compor obra" → religar `catalogo.ativo` do Livre das Dívidas → compra de teste (P4).
**Próxima ação que não depende do dono:** progresso de leitura dos livros comprados no servidor (tabela + rota no worker + `aoProgredir` em `area-cliente.html`), em branch própria.

**Materiais:** skill em `.claude/skills/pagina-de-obra/`; regulamento em `docs/nema/regulamento-geral-v1-rascunho.md`; decisões e pendências em `docs/nema/modelo-e-plano.md`.
