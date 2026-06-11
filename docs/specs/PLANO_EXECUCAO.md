# PLANO_EXECUCAO.md — Entrega Final 3trevo
> Spec executável para Claude Code. Terminal é o juiz; cada fase começa com bloco de verificação.
> Regra absoluta: nada é "concluído" sem verificação no terminal ou no Supabase. Proibido descrever output fictício.

## CONTEXTO FIXO
- Supabase project: `xfkepekffdyrtcgagwqo`
- Worker: `tres-trevo-api.al-kbhal.workers.dev` (deploy: `CLOUDFLARE_API_TOKEN` + `npx wrangler deploy`; plano free NÃO aceita `limits.cpu_ms`)
- Repo: github.com/alkbhal/3trevo (GitHub Pages)
- Admin local: `http://localhost:5500/admin`
- Programa Cultural = promoção comercial modalidade SORTEIO (Lei 5.768/71). Vencedor DEVE derivar da extração da Loteria Federal. RNG interno só atribui cotas. Série: 100.000 cotas (00000–99999). Prêmio em bens/serviços.
- Rifei não existe no projeto. Não referenciar.

## ESTADO VERIFICADO (10/06/2026)
- `afiliados` EXISTE com colunas: id, nome, email, slug, percentual_comissao, ativo, criado_em. Item "tabela ausente" é ghost item — se houver 503, o bug está no Worker.
- `draws` tem `numero_sorteado integer` e NENHUM campo de Loteria Federal → **schema de apuração exige redesign (Fase 2)**.
- `draws.data_sorteio` é nullable; Rodada 1 com valor null (card "Próxima Premiação" mostra "—").
- Tabelas existentes: catalogo, clientes, pedidos, config, premios, auditoria, lgpd_solicitacoes, admin_sessoes, profiles, products, payments, purchases, subscriptions, user_library, downloads, draws, draw_entries, draw_winners, draw_numbers, bonus, admin_users, manuscritos, royalty_pagamentos, afiliados, notas_fiscais, gdpr_requests, audit_log, draw_audits, depoimentos, respostas_pesquisa (+ dash_* locais).

## BLOQUEIOS HUMANOS (únicos pontos que exigem Dias — tudo o resto é autônomo)
| # | Item | Ação do Dias | Desbloqueia |
|---|------|--------------|-------------|
| B1 | Resend API key | Criar em resend.com → colar no terminal quando Claude Code pedir (`wrangler secret put RESEND_API_KEY`) | Fase 4 (entrega de ebook) |
| B2 | Certificado .pfx A1 (contador) + OAuth Bling | Obter arquivo + autorizar app | Fase 5 (NF-e) — fase fica em modo stub até lá |
| B3 | Protocolo SPA/MF | Pós-validação total | Fora deste plano |

Decisão já incorporada: **Make.com sai do fluxo de entrega de ebook.** A entrega migra para Resend disparado direto pelo Worker no webhook de pagamento. Isso elimina o bloqueio do Gmail OAuth e remove um ponto externo. Make.com fica apenas para automações não críticas.

---

## FASE 0 — Verificação global
Antes de qualquer ação:
```bash
# repo limpo e atualizado
git -C ./3trevo status --porcelain && git -C ./3trevo pull
# worker responde
curl -s -o /dev/null -w "%{http_code}\n" https://tres-trevo-api.al-kbhal.workers.dev/health || true
# wrangler autenticado
npx wrangler whoami
```
Via MCP Supabase: `list_tables(schemas:['public'], verbose:true)` — confirmar schema real contra este documento. Divergência → atualizar este arquivo ANTES de agir.

---

## FASE 1 — Correções de banco (Supabase, via apply_migration)
**Verificar antes:**
```sql
SELECT id, titulo, status, data_sorteio FROM draws;
SELECT count(*) FROM draw_entries;
```
**Ações:**
1. `data_sorteio` da Rodada 1: definir data real (próxima extração da Loteria Federal de sábado posterior à meta — usar placeholder configurável em `config` se meta não atingida; o card deve ler de `config.proxima_extracao_lf` quando `draws.data_sorteio IS NULL`).
2. Limpar colunas legadas de `depoimentos` (instagram, bonus_whatsapp, bonus_compartilhou, palavras) — somente se nenhum código referenciar (grep no repo antes de dropar).

**Verificar depois:** re-rodar os SELECTs; card no admin deve mostrar data.

---

## FASE 2 — Redesign da apuração → Loteria Federal (CRÍTICO)
O schema atual usa `draws.numero_sorteado` (RNG interno) como fonte da verdade. Isso é incompatível com a classificação legal. Redesign:

**Migration `lf_apuracao`:**
```sql
ALTER TABLE draws
  ADD COLUMN IF NOT EXISTS lf_concurso integer,
  ADD COLUMN IF NOT EXISTS lf_data_extracao date,
  ADD COLUMN IF NOT EXISTS lf_premios jsonb,          -- os 5 prêmios da extração, verbatim
  ADD COLUMN IF NOT EXISTS cota_vencedora char(5),     -- derivada, NÃO sorteada internamente
  ADD COLUMN IF NOT EXISTS formula_versao text DEFAULT 'LF-UNIDADES-V1';

COMMENT ON COLUMN draws.cota_vencedora IS
 'Derivada da extração oficial: dígito das unidades do 1º ao 5º prêmio da Loteria Federal, lidos de cima para baixo, formam a cota de 5 dígitos (00000-99999). Sem ganhador (cota não vendida e não emitida): regra de aproximação definida no regulamento.';
```
Em `draw_audits`: garantir colunas `data_apuracao`, `lf_concurso`, `certificado_numero`, `testemunha_1`, `testemunha_2`, `hash_evidencia` (adicionar se ausentes — verificar schema real primeiro).

**Worker — endpoint `/apuracao` (admin-only):**
- Input: número do concurso LF + os 5 prêmios (digitados pelo operador a partir do resultado oficial; sem scraping — fonte oficial vai no registro de auditoria).
- Deriva `cota_vencedora` pela fórmula V1, grava em `draws`, cruza com `draw_entries`, grava `draw_winners`, insere registro em `draw_audits` com hash SHA-256 do payload.
- `numero_sorteado` é DEPRECIADO: manter coluna, parar de escrever, marcar no código.

**Verificar depois:** teste de unidade da fórmula (prêmios fictícios conhecidos → cota esperada) rodando no terminal; SELECT confirmando colunas.

---

## FASE 3 — Worker: segurança e bugs
**Verificar antes:** ler código do webhook e dos endpoints do admin no repo.
1. **HMAC nos webhooks**: validar assinatura em todo endpoint de webhook (segredo via `wrangler secret put WEBHOOK_HMAC_SECRET` — gerar com `openssl rand -hex 32`, registrar no provedor quando o trilho PIX for definido; até lá, validar com segredo próprio nos testes).
2. **503 em /afiliados**: diagnosticar — tabela existe; provável mismatch de nome de coluna ou RLS. Corrigir query/policy.
3. **HEAD requests** quebrando contadores do dashboard: substituir HEAD por `GET` com `Prefer: count=exact` + `Range: 0-0` (padrão PostgREST) ou endpoint agregador único no Worker.
4. **Painel Vendas vazio**: ligar a `purchases`/`payments` reais; sem dados fictícios — se vazio, mostrar estado vazio honesto.
5. Deploy: `npx wrangler deploy` e smoke test com curl em cada endpoint alterado (status + payload).

---

## FASE 4 — Entrega de ebook via Resend (substitui Make.com/Gmail)
**Bloqueio B1:** pedir a key ao Dias UMA vez no início da fase; tudo o mais é autônomo.
1. `wrangler secret put RESEND_API_KEY`.
2. No fluxo do webhook de pagamento confirmado: gerar link assinado de download (tabela `downloads`, expiração 72h, máx. 3 downloads), enviar e-mail via Resend (remetente sac@3trevo.com.br — conferir domínio verificado no Resend; se não verificado, instruir Dias com os registros DNS exatos a criar no Cloudflare e aguardar).
3. Registrar envio em `audit_log`.
4. Fallback Z-API/WhatsApp: deixar stub claramente marcado `TODO`, não simular.

**Verificar depois:** compra de teste (payload de webhook simulado com HMAC válido) → e-mail recebido → link baixa o arquivo → contadores atualizam.

---

## FASE 5 — NF-e Bling (modo stub até B2)
1. Implementar módulo completo de emissão (NCM 4901.99.00, CFOP 6.107) com flag `NFE_ENABLED=false` em `config`.
2. Toda venda grava linha em `notas_fiscais` com status `pendente_certificado`.
3. Quando B2 for resolvido: ligar flag, OAuth Bling, reprocessar pendentes.
**Verificar:** venda de teste cria linha `pendente_certificado`; nenhuma chamada real ao Bling com flag off.

---

## FASE 6 — Admin panel: fechamento
Escopo fixo (não expandir): catálogo, prêmios, fila revisao_manual de depoimentos, métricas, afiliados, royalties, conciliação de split.
1. Contadores funcionando (pós Fase 3).
2. Card Próxima Premiação lendo `data_sorteio`/`config.proxima_extracao_lf`.
3. Tela de apuração consumindo `/apuracao` (Fase 2) com campos: concurso, 5 prêmios, testemunhas, certificado.
4. Nenhuma aba de Forge/criação — ferramenta é local, fora do site.

---

## FASE 7 — E2E + relatório final
Roteiro completo no terminal, sem pular etapas:
1. Cadastro → compra (webhook simulado HMAC) → e-mail Resend → download → cota gerada em `draw_entries` → NF pendente → apuração simulada (concurso fictício marcado `TESTE`) → vencedor em `draw_winners` → registro em `draw_audits` → limpar dados de teste (DELETE com WHERE explícito, nunca TRUNCATE).
2. Gerar `RELATORIO_ENTREGA.md` com: cada verificação executada + output real (copiado do terminal), lista do que está funcional, e os bloqueios B2/B3 restantes.
3. Commit + push de tudo.

## REGRAS DE EXECUÇÃO
- Uma fase por vez; verificação antes e depois; falha → diagnosticar e corrigir antes de avançar, nunca mascarar.
- DDL via `apply_migration`, leitura via `execute_sql`.
- Segredos nunca no repo. `.dev.vars` no .gitignore.
- Edições no Make.com são via interface web (API bloqueada no tier) — mas este plano remove o Make do caminho crítico, então não deve ser necessário.
- Terminologia: cotas, Rodada, Ciclos de Premiação, apuração, revisao_manual.
