# Relatório de Entrega — 3Trevo Worker

**Data:** 2026-06-12  
**Worker:** `tres-trevo-api.al-kbhal.workers.dev`  
**Supabase project:** `xfkepekffdyrtcgagwqo`  
**Executor:** alkbhal

---

## Resumo das Fases Executadas

| Fase | Descrição | Status |
|------|-----------|--------|
| 0 | Auditoria e setup de secrets | ✅ Concluída |
| 1 | Dashboard admin — cards e config | ✅ Concluída |
| 2 | Página de prêmios (premiacoes.html) | ✅ Concluída |
| 3 | Painel de vendas via Worker (bypass RLS) | ✅ Concluída |
| 4 | Resend e-mail stub | ✅ Concluída (B1 pendente) |
| 5 | NF-e stub (Bling/pfx) | ✅ Concluída (B2 pendente) |
| 6 | Modal apuração LF no admin | ✅ Concluída |
| 7 | E2E completo + limpeza + relatório | ✅ Concluída |

---

## Fase 7 — Verificações E2E com Output Real

### 1. Correção da função `upsert_cliente_pedido`

**Problema:** `column d.pedido_id does not exist`  
**Causa:** a função original tentava acessar `d.pedido_id` mas o PK da tabela `pedidos` é `id`.  
**Correção:** DROP + CREATE OR REPLACE com lógica plpgsql correta (SELECT/INSERT explícitos, sem alias problemático).  
**SQL adicionado em:** `supabase/schema.sql`

### 2. Webhook HMAC — pedido novo

```
POST /api/checkout/webhook
Header: X-Checkout-Signature: df41f6b775f5eabf15ff10490a5c444408d176a10e8c2ac337dd25de589f1959
Body: {"nome":"Teste E2E","email":"e2e-teste@3trevo.com.br","telefone":"(11) 99999-0000","ebook_slug":"antifalencia","valor_pago":29.90,"id_externo":"E2E-TEST-001"}

Resposta:
{"ok":true,"novo_pedido":true,"pedido_id":"078f99a4-0c67-4ee9-b61b-4be8ba4a9456","mensagem":"Pedido registrado com sucesso."}
```

### 3. Dados criados no banco

**pedidos:**
```json
{"id":"078f99a4-0c67-4ee9-b61b-4be8ba4a9456","cliente_id":"117a362a-cbce-48ab-895a-424ed8aa88b5","ebook_slug":"antifalencia","ebook_titulo":"O Guia Antifalência do Empreendedor Iniciante","valor_pago":29.90,"status":"paid","criado_em":"2026-06-12T03:40:21.178909+00:00"}
```

**clientes:**
```json
{"id":"117a362a-cbce-48ab-895a-424ed8aa88b5","nome":"Teste E2E","email":"e2e-teste@3trevo.com.br","telefone":"(11) 99999-0000"}
```

### 4. Idempotência

```
POST /api/checkout/webhook (mesmo payload, mesmo id_externo)

Resposta:
{"ok":true,"novo_pedido":false,"pedido_id":"078f99a4-0c67-4ee9-b61b-4be8ba4a9456","mensagem":"Pedido já existia — ignorado (idempotência)."}
```

### 5. Rejeição de assinatura inválida

```
POST /api/checkout/webhook
Header: X-Checkout-Signature: invalida

Resposta:
{"error":"Não autorizado.","ok":false}  → HTTP 401
```

### 6. Apuração LF — concurso fictício TESTE

```
POST /api/admin/apuracao
Header: X-Session-Token: <token>
Body: {"draw_id":"4ee9dee5-5c30-4257-a2a7-9828a180ce52","lf_concurso":9999,
       "lf_data_extracao":"2026-06-12","lf_premios":[10001,23456,34567,45678,56789],
       "testemunha1":"Teste Automatico","testemunha2":"CI Bot"}

Resposta:
{"ok":true,"draw_id":"4ee9dee5-5c30-4257-a2a7-9828a180ce52","lf_concurso":9999,
 "cota_vencedora":"16789","cota_emitida":false,"vencedor_user_id":null,
 "hash_evidencia":"af47ebdd625a16a190c62dde378ab295c6f183144460794a7b39f1eb3004293d",
 "aviso":"Cota não emitida — aplicar regra de aproximação conforme regulamento."}
```

**Fórmula LF-UNIDADES-V1 verificada:**  
`[10001, 23456, 34567, 45678, 56789]` → unidades `[1, 6, 7, 8, 9]` → cota `"16789"` ✅

### 7. draw_audits criado

```json
{"id":"9530f3ae-8f11-4fea-bdb6-5fa9616f1cff","draw_id":"4ee9dee5-5c30-4257-a2a7-9828a180ce52",
 "action":"apuracao_lf","seed":"LF-9999",
 "details":{"formula":"LF-UNIDADES-V1","lf_premios":[10001,23456,34567,45678,56789],"cota_emitida":false,"cota_vencedora":"16789"},
 "executed_by":"admin","timestamp":"2026-06-12T03:44:11.120076+00:00",
 "hash_evidencia":"af47ebdd625a16a190c62dde378ab295c6f183144460794a7b39f1eb3004293d"}
```

### 8. Limpeza de dados de teste

Todos os registros removidos com DELETE WHERE explícito (sem TRUNCATE):

```
draw_audits?draw_id=eq.<TESTE>   → HTTP 204
draw_winners?draw_id=eq.<TESTE>  → HTTP 204
draw_entries?draw_id=eq.<TESTE>  → HTTP 204
draws?id=eq.<TESTE>              → HTTP 204
pedidos?id_externo=eq.E2E-TEST-001 → HTTP 204
clientes?email=eq.e2e-teste@... → HTTP 204
```

---

## O que está funcional

| Funcionalidade | Endpoint / Local |
|----------------|-----------------|
| Login admin + sessão | `POST /api/admin/login` |
| Dashboard (vendas, sorteios, config) | `GET /api/admin/vendas`, `/catalogo`, `/config` |
| Checkout webhook HMAC-SHA256 | `POST /api/checkout/webhook` |
| Registro de cliente + pedido (idempotente) | RPC `upsert_cliente_pedido` |
| Apuração LF com fórmula LF-UNIDADES-V1 | `POST /api/admin/apuracao` |
| Audit trail de apuração | tabela `draw_audits` |
| Depoimentos públicos | `GET /api/public/depoimentos` |
| Catálogo público | `GET /api/public/catalogo` |
| Acervo Forge | `GET /api/admin/acervo-forge` |
| NF-e stub (insere `pendente_certificado`) | `nfeStub()` em checkout-proprio.ts |
| Resend e-mail stub (skip graceful) | `enviarEmailResend()` |

---

## Bloqueadores Restantes

### B1 — Resend (e-mail transacional)

- **Status:** stub ativo, skip graceful se `RESEND_API_KEY` ausente.
- **Próxima ação:** criar conta em resend.com, verificar domínio `3trevo.com.br`, rodar `wrangler secret put RESEND_API_KEY`.

### B2 — NF-e / Bling

- **Status:** stub insere `notas_fiscais.status = 'pendente_certificado'`. FK `purchase_id` mapeado para `purchases.id` (tabela MP); para o checkout próprio, precisará de ajuste para referenciar `pedidos.id`.
- **Próxima ação:** abrir conta PJ → certificado .pfx → OAuth Bling → implementar emissão real.

### B3 — draw_entries via checkout próprio

- **Status:** o webhook registra cliente + pedido, mas não cria `draw_entries` automaticamente (esse papel é da edge function `process-payment` do fluxo MP).
- **Próxima ação:** implementar criação de draw_entries no handler do checkout próprio, ou criar trigger SQL em `pedidos`.

---

## Secrets configurados no Worker

| Secret | Status |
|--------|--------|
| `ADMIN_SENHA` | ✅ Configurado |
| `SUPABASE_SERVICE_KEY` | ✅ Configurado |
| `ANTHROPIC_API_KEY` | ✅ Configurado |
| `RIFEI_WEBHOOK_SECRET` | ✅ Configurado |
| `CHECKOUT_WEBHOOK_SECRET` | ✅ Configurado (valor de teste) |
| `RESEND_API_KEY` | ❌ Pendente (B1) |
