# Deploy — Editora Três Trevo
> Guia completo e seguro. **Nunca inserir tokens reais neste arquivo.**

---

## Índice

1. [Pré-requisitos](#pré-requisitos)
2. [Schema do banco (Supabase)](#1-schema-do-banco-supabase)
3. [Secrets obrigatórios](#2-secrets-obrigatórios)
4. [Deploy das Edge Functions](#3-deploy-das-edge-functions)
5. [Supabase Storage — buckets](#4-supabase-storage--buckets)
6. [Configuração do domínio e DNS](#5-configuração-do-domínio-e-dns)
7. [GitHub Pages](#6-github-pages)
8. [Webhook MercadoPago](#7-webhook-mercadopago)
9. [Testes com sandbox](#8-testes-com-sandbox)
10. [Checklist de go-live](#9-checklist-de-go-live)

---

## Pré-requisitos

- Conta Supabase ativa com projeto criado
- Supabase CLI instalado: `npm install -g supabase`
- Conta MercadoPago com aplicação criada (credenciais de produção)
- Conta Resend com API Key criada
- Domínio `3trevo.com.br` com acesso ao painel DNS
- Repositório no GitHub com GitHub Pages habilitado

---

## 1. Schema do banco (Supabase)

### 1.1 Executar o schema

No painel do Supabase:

1. Abrir **SQL Editor** → **New query**
2. Colar o conteúdo completo de `supabase/schema.sql`
3. Clicar **Run**
4. Confirmar que as 11 tabelas foram criadas (verificar em **Table Editor**)

### 1.2 Tabelas criadas

| Tabela | Finalidade |
|--------|-----------|
| `profiles` | Dados dos usuários (extensão do auth.users) |
| `products` | Catálogo de ebooks |
| `payments` | Registros de pagamentos do MercadoPago |
| `purchases` | Compras confirmadas (payment_id, user_id, product_id) |
| `user_library` | Biblioteca do cliente (ebooks liberados) |
| `downloads` | Log de downloads (geração de URL assinada) |
| `draws` | Sorteios culturais |
| `draw_entries` | Participações no sorteio (cotas) |
| `config` | Configurações públicas (key-value) |
| `premios` | Prêmios do sorteio (exibição pública) |
| `depoimentos` | Depoimentos de leitores (moderação) |

### 1.3 Configurar meta_valor do sorteio

Após executar o schema, defina o valor real da meta no painel:

```sql
UPDATE draws
SET meta_valor = <SEU_VALOR_INTERNO>
WHERE titulo = 'Rodada 1 — Programa Cultural Três Trevo';
```

> **Nota de segurança:** O seed no schema.sql tem `meta_valor = 0.00` propositalmente.
> Defina o valor real diretamente no Supabase (não no repositório).

### 1.4 Verificar RLS

Confirmar que RLS está habilitado em todas as tabelas:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

Todas devem mostrar `rowsecurity = true`.

---

## 2. Secrets obrigatórios

Configure no painel: **Supabase → Settings → Edge Functions → Secrets**
ou via CLI (recomendado):

```bash
# Login e link ao projeto
supabase login
supabase link --project-ref xfkepekffdyrtcgagwqo

# Configurar secrets (substituir pelos valores reais)
supabase secrets set MP_ACCESS_TOKEN="APP_USR-SEU_TOKEN_REAL_AQUI"
supabase secrets set RESEND_API_KEY="re_SEU_KEY_REAL_AQUI"
supabase secrets set SITE_URL="https://3trevo.com.br"
supabase secrets set FROM_EMAIL="sac@3trevo.com.br"
```

| Secret | Descrição | Obrigatório |
|--------|-----------|-------------|
| `MP_ACCESS_TOKEN` | Access Token de **produção** do MercadoPago | ✅ |
| `RESEND_API_KEY` | API Key do [Resend](https://resend.com) | ✅ (e-mails) |
| `SITE_URL` | `https://3trevo.com.br` | ✅ |
| `FROM_EMAIL` | `sac@3trevo.com.br` | Opcional |

> **Automáticos** (já existem no ambiente Supabase — não configurar):
> - `SUPABASE_URL`
> - `SUPABASE_SERVICE_ROLE_KEY`

### Onde obter os tokens

**MercadoPago:**
1. https://www.mercadopago.com.br/developers/panel
2. Aplicações → sua aplicação → Credenciais de produção
3. Copiar o **Access Token** (começa com `APP_USR-`)

**Resend:**
1. https://resend.com/api-keys
2. Criar chave com permissão `Full access` (ou `Sending access`)
3. Copiar a chave (começa com `re_`)

---

## 3. Deploy das Edge Functions

```bash
# A partir da raiz do projeto
supabase functions deploy create-preference
supabase functions deploy mp-webhook
supabase functions deploy get-download
supabase functions deploy validate-entry
```

### URLs das Edge Functions

| Function | URL |
|----------|-----|
| `create-preference` | `https://xfkepekffdyrtcgagwqo.supabase.co/functions/v1/create-preference` |
| `mp-webhook` | `https://xfkepekffdyrtcgagwqo.supabase.co/functions/v1/mp-webhook` |
| `get-download` | `https://xfkepekffdyrtcgagwqo.supabase.co/functions/v1/get-download` |
| `validate-entry` | `https://xfkepekffdyrtcgagwqo.supabase.co/functions/v1/validate-entry` |

### Verificar deploy

No painel Supabase → **Edge Functions** → confirmar que as 4 functions aparecem com status `Active`.

---

## 4. Supabase Storage — buckets

### 4.1 Criar buckets

No painel Supabase → **Storage** → **New bucket**:

| Nome | Tipo | Finalidade |
|------|------|-----------|
| `ebooks` | **Privado** | PDFs dos ebooks (acesso via URL assinada) |
| `capas` | **Público** | Imagens de capa (opcional, para thumbnails) |

> **Importante:** O bucket `ebooks` deve ser **privado**. O acesso é controlado pela Edge Function `get-download` que gera URLs assinadas de 72h.

### 4.2 Upload dos PDFs

No painel Supabase → Storage → `ebooks` → Upload:

```
ebooks/
  justicamento.pdf
  vigilante.pdf
  terceiraguerra.pdf
  antifalencia.pdf
```

### 4.3 Atualizar arquivo_url no banco

```sql
UPDATE products SET arquivo_url = 'justicamento.pdf'  WHERE slug = 'justicamento';
UPDATE products SET arquivo_url = 'vigilante.pdf'     WHERE slug = 'vigilante';
UPDATE products SET arquivo_url = 'terceiraguerra.pdf' WHERE slug = 'terceiraguerra';
UPDATE products SET arquivo_url = 'antifalencia.pdf'  WHERE slug = 'antifalencia';
```

---

## 5. Configuração do domínio e DNS

### 5.1 GitHub Pages (CNAME)

O arquivo `CNAME` no repositório já contém `3trevo.com.br`.

No seu provedor de DNS, adicionar:

| Tipo | Nome | Valor |
|------|------|-------|
| `CNAME` | `www` | `alkbhal.github.io` |
| `A` | `@` | `185.199.108.153` |
| `A` | `@` | `185.199.109.153` |
| `A` | `@` | `185.199.110.153` |
| `A` | `@` | `185.199.111.153` |

> Para subdomínio `www` redirecionar para raiz, adicione também o CNAME e o GitHub Pages fará o redirecionamento automaticamente.

### 5.2 Resend (e-mail transacional)

No painel Resend → **Domains** → Add Domain → `3trevo.com.br`:

| Tipo | Nome | Valor |
|------|------|-------|
| `MX` | `send` | `feedback-smtp.us-east-1.amazonses.com` (Resend mostra o valor exato) |
| `TXT` | `send` | Registro SPF fornecido pelo Resend |
| `TXT` | `resend._domainkey` | Registro DKIM fornecido pelo Resend |
| `TXT` | `_dmarc` | `v=DMARC1; p=none;` (mínimo recomendado) |

> O Resend exibe os valores exatos de cada registro na interface. Use os valores que ele fornecer.

### 5.3 Propagação DNS

Aguardar 15–60 minutos após adicionar os registros. Verificar com:

```bash
nslookup 3trevo.com.br
# ou
dig 3trevo.com.br
```

---

## 6. GitHub Pages

1. Repositório GitHub → **Settings** → **Pages**
2. Source: **Deploy from a branch**
3. Branch: `main` → `/ (root)`
4. Clicar **Save**
5. Aguardar ~2 minutos para o primeiro deploy
6. **Custom domain**: `3trevo.com.br` (já configurado via CNAME)
7. Marcar **Enforce HTTPS** (após DNS propagar)

---

## 7. Webhook MercadoPago

A URL do webhook já é configurada automaticamente pela função `create-preference`:

```
https://xfkepekffdyrtcgagwqo.supabase.co/functions/v1/mp-webhook
```

Opcionalmente, configure também no painel do MercadoPago para notificações adicionais:

1. https://www.mercadopago.com.br/developers/panel
2. Aplicações → sua aplicação → **Webhooks**
3. URL: `https://xfkepekffdyrtcgagwqo.supabase.co/functions/v1/mp-webhook`
4. Eventos: `payment`

---

## 8. Testes com sandbox

Para testar sem cobrar de verdade:

```bash
# Usar token de teste do MercadoPago
supabase secrets set MP_ACCESS_TOKEN="TEST-xxxx-SEU_TOKEN_TESTE"
```

No `checkout.html`, para usar o ambiente sandbox, troque na função `iniciarCheckout`:
```javascript
// Teste: usar sandbox_init_point
window.location.href = data.sandbox_init_point;

// Produção: usar init_point
window.location.href = data.init_point;
```

**Cartões de teste MP:**
- Aprovado: `5031 4332 1540 6351` | CVV: `123` | Venc: `11/25`
- Recusado: `4000 0000 0000 0002`
- Docs: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/integration-test/test-cards

**Após testar:** Restaurar token de produção e usar `init_point`.

---

## 9. Checklist de go-live

### Infraestrutura
- [ ] Schema SQL executado no Supabase SQL Editor (11 tabelas criadas)
- [ ] RLS verificado em todas as tabelas (`rowsecurity = true`)
- [ ] `meta_valor` do sorteio atualizado no banco (não no repo)
- [ ] Bucket `ebooks` criado como **privado** no Storage
- [ ] Bucket `capas` criado como **público** no Storage (opcional)
- [ ] PDFs dos 4 ebooks uploaded no bucket `ebooks`
- [ ] `arquivo_url` atualizado em todos os produtos no banco

### Secrets e autenticação
- [ ] `MP_ACCESS_TOKEN` (produção) configurado como secret
- [ ] `RESEND_API_KEY` configurado como secret
- [ ] `SITE_URL` = `https://3trevo.com.br` configurado
- [ ] Supabase Auth: habilitar provedor **Email** (Settings → Auth → Providers)
- [ ] Supabase Auth: configurar URL de redirecionamento: `https://3trevo.com.br/area-cliente.html`

### Edge Functions
- [ ] `create-preference` deployada e ativa
- [ ] `mp-webhook` deployada e ativa
- [ ] `get-download` deployada e ativa
- [ ] `validate-entry` deployada e ativa

### DNS e domínio
- [ ] Registros A do GitHub Pages adicionados ao DNS
- [ ] CNAME `www` adicionado ao DNS
- [ ] Registros Resend (MX, SPF, DKIM) adicionados ao DNS
- [ ] DNS propagado (aguardar 15–60 min)
- [ ] GitHub Pages com HTTPS habilitado

### Fluxo de pagamento
- [ ] Teste completo: `index.html` → `checkout.html` → MP → webhook → e-mail → `area-cliente.html`
- [ ] E-mail de confirmação recebido com link de download
- [ ] Download do PDF funciona (URL assinada de 72h)
- [ ] Participação no sorteio registrada na tabela `draw_entries`

### Segurança final
- [ ] Nenhum token real em arquivos do repositório (grep por `APP_USR-`, `re_`)
- [ ] `admin.html` confirmado no `.gitignore` e fora do repositório
- [ ] `config.json` e `progresso.json` fora do repositório
- [ ] MP Access Token revogado e regenerado (histórico git comprometido)
- [ ] Repositório tornado **privado** ou histórico limpo com BFG (ver SECURITY.md)

### Go/No-go final
- [ ] Fluxo PT completo testado
- [ ] Verificar área do cliente em mobile (responsividade)
- [ ] Google Search Console: adicionar sitemap `https://3trevo.com.br/sitemap.xml`
- [ ] Analytics/monitoramento configurado (opcional)

---

## Deploy script rápido

```bash
cd supabase

# Definir secrets via variáveis de ambiente (não commitar este comando)
supabase secrets set \
  MP_ACCESS_TOKEN="APP_USR-SEU_TOKEN_REAL_AQUI" \
  RESEND_API_KEY="re_SEU_KEY_REAL_AQUI" \
  SITE_URL="https://3trevo.com.br" \
  FROM_EMAIL="sac@3trevo.com.br"

# Deploy das 4 functions
supabase functions deploy create-preference
supabase functions deploy mp-webhook
supabase functions deploy get-download
supabase functions deploy validate-entry

echo "Deploy concluído."
```
