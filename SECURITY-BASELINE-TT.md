# SECURITY-BASELINE-TT.md
**Versão:** 1.0 | **Data:** 2026-07-12 | **Dono:** Rogério (Três Trevo)
**Regra-mestra:** Nenhuma fase de funcionalidade inicia sem Fase 0 fechada.
Nenhum deploy sem as 4 camadas ativas E testadas.
**Instrução para Claude Code:** Ler este documento ANTES de qualquer
alteração. Toda mudança de segurança exige aprovação humana explícita.

---

## ITEM ZERO — Contas-raiz (bloqueante absoluto)
Se a conta-mãe cai, todas as camadas caem juntas.

| Conta | Serviço | MFA ativo? | Método | Validado em |
|---|---|---|---|---|
| al_kbhal@yahoo.com.br | Cloudflare | ☐ | TOTP (app) | — |
| rogerio.kbhal@gmail.com | Google/Drive | ☐ | TOTP (app) | — |
| — | Supabase | ☐ | TOTP (app) | — |
| — | GitHub (alkbhal) | ☐ | TOTP (app) | — |
| — | Anthropic Console | ☐ | TOTP (app) | — |

**Padrão:** TOTP via app autenticador (não SMS). Códigos de recuperação
impressos e guardados fisicamente, fora do celular.

---

## CAMADA 1 — BORDA (Cloudflare)
*Bloqueia o ataque antes de tocar seu sistema.*

- [ ] WAF Managed Rules (OWASP Core Ruleset) — ativado por zona
- [ ] Bot Fight Mode / Super Bot Fight Mode
- [ ] Rate Limiting: regra por endpoint sensível (login, checkout, API)
  — padrão inicial: 30 req/min por IP em rotas de autenticação
- [ ] Turnstile em todo formulário público (login, cadastro, compra)
- [ ] SSL/TLS modo "Full (Strict)"
- [ ] HSTS ativado
- [ ] Bloqueio de países sem público-alvo (opcional, avaliar por projeto)

**Teste de validação:** enviar request com payload SQLi clássico
(`' OR 1=1--` em query string) → deve retornar bloqueio 403 do WAF.
Registrar evidência (screenshot do Security Event) na tabela de status.

---

## CAMADA 2 — DADOS E AUTENTICAÇÃO (Supabase / D1)
*Se a borda falhar, o dado ainda se protege sozinho.*

- [ ] RLS habilitado em TODA tabela do Supabase (sem exceção)
- [ ] Política RLS revisada por tabela: usuário só lê/escreve o que é dele
- [ ] Nenhuma query usa service_role key no lado do cliente
- [ ] Supabase Auth: MFA disponível para usuários admin
- [ ] Rotação de chaves: anon key e service key com data de rotação
  registrada no Inventário de Segredos (abaixo)
- [ ] D1/KV: bindings só via Wrangler Secrets, nunca hardcoded

**Teste de validação:** com a anon key pública, tentar SELECT em tabela
de outro usuário via API REST → deve retornar vazio ou erro de política.

---

## CAMADA 3 — OBSERVAÇÃO E RESPOSTA
*Você não combate o que não vê.*

- [ ] Sentry ativo
- [ ] Cloudflare Security Events: revisão semanal (agenda recorrente)
- [ ] Uptime: Better Stack ou UptimeRobot monitorando cada domínio
  público, alerta por e-mail
- [ ] Alertas de erro crítico do Sentry por e-mail
- [ ] Logs de Workers: `wrangler tail` documentado como procedimento

**Resposta a incidente (playbook mínimo, execução HUMANA):**
1. Confirmar no Security Events / Sentry o que está acontecendo
2. Se ataque ativo: ativar "Under Attack Mode" no Cloudflare (1 clique)
3. Se chave comprometida: rotacionar no serviço de origem, atualizar
   Secret no Worker, registrar no Inventário de Segredos
4. Registrar o incidente em REGISTRO_FALHAS.md

**Teste de validação:** derrubar de propósito uma página de teste →
alerta de uptime deve chegar em até 5 minutos.

---

## CAMADA 4 — RECUPERAÇÃO
*Assuma que um dia algo será destruído. A pergunta é: você volta?*

- [ ] Supabase: Point-in-Time Recovery ativado (ou backup diário no
  plano free via export agendado)
- [ ] Export mensal manual do Supabase (SQL dump) guardado no Drive
- [ ] D1: export periódico via `wrangler d1 export` (documentar comando)
- [ ] GitHub: repositórios são o backup do código — confirmar que TODO
  projeto ativo tem repo atualizado
- [ ] Teste de restauração: 1x por trimestre, restaurar um backup em
  projeto de teste e confirmar que abre

**Teste de validação:** backup que nunca foi restaurado não é backup.
O teste trimestral É o critério.

---

## INVENTÁRIO DE SEGREDOS
*Um lugar único. Nunca colar valores aqui — só onde estão e quando giram.*

| Segredo | Onde vive | Usado por | Última rotação | Próxima |
|---|---|---|---|---|
| Supabase service_role | Wrangler Secret | Loteria/DOTIS | — | +90d |
| ADMIN_SECRET | Wrangler Secret | DOTIS Worker | 2026-07-12 | 2026-10-12 |
| Cloudflare API token | local (Wrangler) | deploys | — | +180d |

**Regras:** (1) nenhum segredo em código, .env commitado ou chat;
(2) rotação máxima 90 dias para chaves de produção; (3) toda rotação
registrada aqui na mesma sessão.

---

## ANEXO A — DOTIS MODO LOCAL (Kit físico)
*Superfície física e de rede que a nuvem não protege.*

- [ ] SSIDs separados confirmados: OPS (operação) e FESTA (público),
  VLANs isoladas — cliente da festa nunca alcança o servidor
- [ ] Senha do SSID OPS: única por evento, trocada a cada festa
- [ ] Servidor: usuário padrão desabilitado; SSH só por chave, nunca senha
- [ ] Firewall: só portas do serviço DOTIS abertas na VLAN OPS
- [ ] Disco: backup do SQLite ao fim de cada evento (pen drive + sync
  para nuvem quando houver internet)
- [ ] Acesso físico: servidor em caixa fechada, fora do alcance do público

**Teste de validação:** conectar celular na rede FESTA e tentar
alcançar o IP do servidor → deve falhar (timeout).

---

## TABELA DE STATUS — DOTIS

| Item | Status | Testado | Data |
|---|---|---|---|
| Item 0 (MFA) | ☐ aguarda verificação humana | ☐ | — |
| C1 Borda | ☐ CF zone existe; WAF/rate-limiting não verificados no painel | ☐ | — |
| C2 Dados (RLS) | ✅ RLS habilitado em 17 tabelas (schema.sql L1440-1457); 0 policies públicas; service_role only | ✅ leitura schema | 2026-07-12 |
| C3 Observação | ⚠️ Conta Sentry criada (rds-anuncios.sentry.io); aguarda DSN para integrar no Worker. UptimeRobot: ação pendente. | ☐ | 2026-07-13 |
| C4 Recuperação | ☐ GitHub existe; backup Supabase não confirmado | ☐ | — |

**Notas da auditoria (2026-07-12):**
- ADMIN_SECRET e SUPABASE_SERVICE_KEY confirmados via `wrangler secret put` em 2026-07-12.
- wrangler.toml sem segredos hardcoded — OK.
- Worker deployado e respondendo em https://dotis-api.al-kbhal.workers.dev
- RLS no Supabase: precisa de verificação manual tabela a tabela (próxima ação).
- Supabase PITR: verificar se plano atual cobre backup automático.
- Registro de teste E2E: ingresso PIN A391 criado em produção (WAITING_PAYMENT) — inofensivo.

---

## FASE 0 — CHECKLIST PARA TODO PROJETO NOVO
Antes de qualquer código de funcionalidade:
1. Item Zero confirmado (MFA nas contas que o projeto usa)
2. Zona/domínio no Cloudflare com Camada 1 ativa
3. Banco criado já com RLS ligado (nunca "ligar depois")
4. Sentry + uptime configurados apontando para o ambiente
5. Backup automático configurado no dia 1
6. Linha adicionada na Tabela de Status
7. Testes de validação das 4 camadas executados e registrados

Só então a Fase 1 técnica do projeto pode iniciar.

---

## REGISTRO DE AUDITORIAS

| Data | Sessão | Resultado | Pendências |
|---|---|---|---|
| 2026-07-13 | Claude Code | C2 RLS ✅ 17 tabelas; ADMIN_SECRET ✅ Wrangler; Sentry conta criada aguarda DSN | Item 0 MFA, C1 WAF, C3 DSN+UptimeRobot, C4 Supabase PITR |
