# FASE 8 (revisado) — Bloco condicional do Programa Cultural em e-mail e página de obra
> Substitui o escopo de Fase A/Fase B do documento original (`Downloads\FASE8_FUNIL_PAGINAS_VENDA.md`,
> trazido de outra conversa em 15/08/2026). Revisão feita contra o estado real do repositório —
> ver justificativa de cada corte abaixo. G1 e G2 (decisões do Dias, 01/08/2026) continuam válidas;
> o que mudou é o tamanho real do trabalho pra chegar lá.

## Por que este documento é menor que o original

O documento original tratava captura de lead, instrumentação e disparo de e-mail como trabalho a
construir (Fase A / Fase B). Verificação no repositório mostrou que isso já está em produção:

- `js/beacon.js` — pop-up de captura + `page_view`/`scroll_depth`/`cta_click`/`time_on_page`,
  ativo em todas as páginas do site, inclusive `obra/*.html`.
- `worker/src/routes/leads.ts` — `POST /api/leads/capture` já grava `leads`, semeia 5 linhas em
  `email_sequence` (steps 0-4) e dispara o step 0 na hora via Resend.
- `worker/src/cron/email-engine.ts` — cron que processa `email_sequence` pendente e envia via
  Resend, com checagem de `unsub`.

**Cadência confirmada com o Dias (15/08/2026): manter a atual (+1/+3/+5/+7 dias desde o cadastro),
não trocar pela proposta do documento original (+2/+4/+7/+10/+14d).** O código de `leads.ts` não
muda nos steps 0-4.

O único ponto de G2 que não existe em lugar nenhum do código — nem no e-mail, nem nas páginas de
obra — é o **bloco condicional do Programa Cultural renderizado a partir do estado real de `draws`**.
Isso é o escopo real desta fase.

---

## PRÉ-REQUISITO BLOQUEANTE (herdado, ainda válido)
Envio real de e-mail já é condicionado a `env.RESEND_API_KEY` existir (`leads.ts`/`email-engine.ts`
retornam sem enviar se a chave não estiver setada) — isso já cobre o gate que o documento original
pedia verificar manualmente. Confirmar mesmo assim antes de tráfego pago real:
```sql
SELECT chave, valor FROM config WHERE chave IN ('mp_enabled','resend_enabled');
```

---

## FASE A — Bloco condicional do Programa Cultural (helper único, dois consumidores)

**Escopo (não expandir sem decisão nova):**
1. Um helper único — `renderBlocoSorteio(draw): string` — que:
   - Consulta `draws WHERE status = 'open'` (ordenar por `data_limite` se houver mais de um aberto,
     confirmar critério antes de codificar caso aconteça).
   - Sem Rodada aberta → retorna string vazia. Nunca contador fake, nunca placeholder vazio ocupando
     espaço visual.
   - Com Rodada aberta → HTML de uma linha secundária com progresso real de `draws.meta_atual /
     meta_valor` (campo confirmado em uso real em `premiacoes.html`, é progresso em R$ — funding
     pay-as-you-go do prêmio — não confundir com a view `draw_progress`, que é progresso de cotas
     vendidas, métrica diferente e não é essa que G2 pede).
   - Urgência ("faltam poucos dias") só se `data_limite` existir e for factualmente próxima —
     nunca linguagem fabricada.
2. **Consumidor 1 — e-mail:** `email-engine.ts` chama o helper antes de montar o HTML e substitui
   `{{sorteio_bloco}}` nos 6 templates (ver Fase B abaixo pra por que são 6, não só nurture_3/4).
3. **Consumidor 2 — páginas de obra:** injeção client-side em `obra/*.html`, mesmo padrão de
   `beacon.js` (fetch a um endpoint público leve, ex. `GET /api/draw/status`, que devolve
   `{status, meta_atual, meta_valor, data_limite}` do draw aberto ou `null`). Não virar template
   dinâmico server-side — o site é estático de propósito (decisão de stack já registrada), então o
   bloco é montado no navegador, não no build.
4. Bloco fica sempre abaixo da dobra principal — nunca hero/banner (G2, decisão do Dias).

**Verificar antes:**
```sql
SELECT id, titulo, status, meta_atual, meta_valor, data_limite FROM draws WHERE status = 'open';
```

**Verificar depois:** com uma Rodada aberta de teste, o bloco aparece em pelo menos 1 página de obra
e em um e-mail de teste; fechando a Rodada (`status != 'open'`), o bloco some dos dois sem deixar
espaço vazio.

---

## FASE B — Templates de e-mail: aplicar o placeholder

1. Ler `email_templates.html` completo dos 5 templates existentes (não só tag/subject) — identificar
   em quais o sorteio está hardcoded no corpo, não só no assunto. nurture_2/nurture_3 precisam de
   revisão de subject line (hoje centram no sorteio; revisar pra centrar no livro, conforme G2).
2. Substituir texto fixo do sorteio por `{{sorteio_bloco}}` nos 6 templates (populado pelo helper da
   Fase A — vazio ou com HTML condicional, nunca hardcoded).
3. Step 5 (`proxima_obra`, tag nova) segue como no documento original: inserir via `execute_sql`
   (dado, não schema) só quando o texto real do próximo título estiver confirmado — não fabricar
   cópia antes de ler a obra. `leads.ts` ganha a 6ª linha de `email_sequence` (step 5, +14 dias) só
   depois que o template existir — sem isso o renderer falha por design, não deve inventar fallback.

**Verificar depois:** lead de teste → e-mails do step 0-4 chegam com cadência inalterada
(+1/+3/+5/+7d) → bloco do sorteio aparece/some conforme existência real de Rodada aberta.

---

## Limpeza de escopo — dead code achado durante a revisão

`worker/src/cron/lf-apuracao.ts` ainda referencia `draws.lf_concurso` e a RPC `apurar_sorteio_lf`,
ambos removidos pela migração `scripts/remove_lf_columns.sql` (16/06/2026, sorteio migrado de
Concurso Cultural/Loteria Federal pra RNG puro interno). Não está registrado em nenhum cron trigger
do `wrangler.jsonc` hoje — dormente, não é bug ativo — mas é um arquivo morto que vai quebrar se
alguém religar sem saber que o schema mudou debaixo dele. **Deletar o arquivo nesta fase, não deixar
pra achar depois.**

---

## FASE C — Prova social por título (gap real, prioridade menor)

Item 4 da Fase A do documento original (`depoimentos WHERE estado='aprovado' AND
ebook_slug/purchase_id referencia o título`) não está implementado em nenhuma das 4 páginas
`obra/*.html` hoje — confirmado por leitura direta. Fica registrado como pendência real, mas não
bloqueia o bloco G2 acima. Nunca fabricar depoimento — se não houver aprovado pro título, omitir a
seção, mesmo princípio do bloco de sorteio.

---

## FASE D — Campanhas pagas (herdado, sem mudança)
Fora do escopo desta fase — tabela `campaigns`/`campaign_daily` já existe e está pronta; populá-la é
ação operacional (criar campanha real em Meta/Google Ads), não tarefa de código. Endereçar só quando
o tráfego pago começar de fato.

---

## NÃO FAZER
- Não reconstruir captura de lead, popup, instrumentação (`beacon.js`) ou o dispatcher de e-mail
  (`email-engine.ts`) — já existem e funcionam.
- Não trocar a cadência de `email_sequence` dos steps 0-4 — confirmado com o Dias, mantém
  +1/+3/+5/+7 dias.
- Não converter `obra/*.html` em template server-side dinâmico — contra a decisão de stack estática
  já registrada; o bloco G2 é injeção client-side, não rebuild de arquitetura.
- Sem contador fake / escassez fabricada — urgência sempre lida de `draws` real.
- Sem sorteio como assunto ou hero de nenhum e-mail ou página — sempre linha secundária condicional.
- Sem template hardcoded pro bloco do sorteio — sempre renderizado a partir de `draws` em tempo real.
- Sem processar `sequence_step = 5` antes do template `proxima_obra` existir de fato.
- Sem inventar texto do template `proxima_obra` ou de prova social sem fonte real.

## REGRAS DE EXECUÇÃO (herdadas do PLANO_EXECUCAO.md)
- Uma fase por vez; verificação antes e depois; terminal/Supabase são o juiz.
- DDL via `apply_migration`, leitura/inserção de dado via `execute_sql`.
- Status: pronto para o terminal iniciar Fase A (helper + 2 consumidores) — é o único bloco de
  trabalho novo de verdade nesta spec.
