# Editora Três Trevo — 3trevo.com.br

Sistema autônomo de publicação, venda e distribuição de ebooks com programa cultural.

## Arquitetura

```
Frontend (GitHub Pages)         Backend (Cloudflare Worker)
├── HTML/CSS/JS puro      ───►  tres-trevo-api.al-kbhal.workers.dev
├── Zero build step              │
└── Deploy: git push             ├── Supabase (PostgreSQL)
                                 │   └── pedidos, catálogo, draws, depoimentos,
                                 │       biblioteca_acervo, slots, historico
                                 │
                                 ├── Cloudflare KV (TT_KV)
                                 │   └── hero-config, rate-limit, health-log,
                                 │       bib:session:*, bib:magic:*
                                 │
                                 ├── Cloudflare R2 (tt-biblioteca)
                                 │   └── EPUBs privados da Biblioteca TT
                                 │
                                 ├── Resend API — emails transacionais
                                 └── Claude Haiku — moderação de depoimentos
```

## Páginas públicas

| Arquivo | Descrição |
|---------|-----------|
| `index.html` | Site principal — hero, carousel, depoimentos |
| `catalogo.html` | Grade de todos os ebooks |
| `obra/*.html` | Páginas individuais de cada obra |
| `checkout.html` | Fluxo de compra |
| `area-cliente.html` | Área do cliente (auth Supabase) |
| `minha-biblioteca.html` | Biblioteca Clássica TT (auth magic link KV) |
| `participacao-cultural.html` | Programa cultural — depoimento + questionário |
| `auditoria-sorteio.html` | Histórico de sorteios com hash SHA-256 público |
| `admin.html` | Painel administrativo (PIN — não indexado) |

## Worker — Estrutura

```
worker/
├── src/
│   ├── index.ts              ← roteador principal + CORS
│   ├── types.ts              ← interface Env (bindings)
│   ├── routes/
│   │   ├── biblioteca.ts     ← Biblioteca TT (auth magic link + epub streaming)
│   │   ├── checkout.ts       ← webhook pagamento + entrega de ebook
│   │   ├── participacao.ts   ← depoimentos + questionário cultural
│   │   ├── apuracao.ts       ← moderação admin + sorteio manual
│   │   ├── admin-catalog.ts  ← CRUD catálogo
│   │   ├── admin-hero.ts     ← config hero via KV
│   │   ├── admin-ai-studio.ts← agente editorial (Claude Haiku)
│   │   ├── admin-depoimentos-ext.ts
│   │   └── health.ts         ← health check
│   └── cron/
│       ├── lf-apuracao.ts    ← sorteio automático (sextas 23:00 UTC)
│       └── health-monitor.ts ← monitor de saúde (a cada hora)
└── wrangler.toml
```

## Deploy

```bash
cd worker
npx tsc --noEmit         # verificar tipos
npx wrangler deploy      # deploy para produção
```

## Secrets (configurar via wrangler secret put)

```
SUPABASE_URL
SUPABASE_SERVICE_KEY
RESEND_API_KEY
ANTHROPIC_KEY
WEBHOOK_HMAC_SECRET
```

## Cron Jobs

| Schedule | Função |
|----------|--------|
| `0 23 * * 5` | Apuração Sistema Loteria TT (sextas 20:00 BRT) |
| `0 * * * *` | Health monitor (toda hora) |

## Regras invioláveis

- **Autor público:** `Said Anes` — nunca outro nome em material público
- **Segredos:** nunca em HTML, GitHub ou qualquer arquivo versionado
- **Loteria Federal / Rifei:** nunca mencionar no frontend — "Sistema Loteria TT" internamente
- **Métricas financeiras:** somente em Cloudflare KV — nunca no código
- **LF-UNIDADES-V1:** BACKEND ONLY — nunca no frontend

## Links

- Site: https://3trevo.com.br
- Admin: https://3trevo.com.br/admin.html
- Worker: https://tres-trevo-api.al-kbhal.workers.dev
- Supabase: https://supabase.com/dashboard/project/xfkepekffdyrtcgagwqo
- Cloudflare: https://dash.cloudflare.com

## Contato

sac@3trevo.com.br
