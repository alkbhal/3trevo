# Editora Três Trevo

Site institucional e loja da Editora Três Trevo — publicação de ebooks e Programa Cultural.

## Stack

- **Frontend:** HTML/CSS/JS puro — hospedado via GitHub Pages
- **Backend:** Supabase (auth, banco, storage, edge functions)
- **Pagamentos:** MercadoPago (via edge function server-side)
- **E-mail:** Resend

## Estrutura

```
├── index.html               # Página principal
├── checkout.html            # Fluxo de compra
├── area-cliente.html        # Área do cliente (autenticado)
├── participacao-cultural.html
├── regras-programa-cultural.html
├── ebook.html               # Leitor de ebook (token protegido)
├── js/
│   ├── supabase-client.js   # Instância Supabase + catálogo local
│   └── auth.js              # Helpers de autenticação
└── supabase/
    ├── schema.sql           # Schema do banco
    ├── deploy.sh            # Script de deploy das edge functions
    ├── deploy.md            # Instruções e checklist
    └── functions/
        ├── create-preference/   # Cria preferência MercadoPago
        ├── mp-webhook/          # Processa notificações de pagamento
        ├── get-download/        # Gera link assinado de download
        └── validate-entry/      # Valida participação no sorteio
```

## Deploy das Edge Functions

```bash
cd supabase
chmod +x deploy.sh
./deploy.sh
```

Veja `supabase/deploy.md` para instruções detalhadas e checklist de go-live.

## Secrets necessários (Supabase)

Configurar em **Settings > Edge Functions > Secrets**:

- `MP_ACCESS_TOKEN` — Access Token de produção do MercadoPago
- `RESEND_API_KEY` — Chave da API do Resend
- `SITE_URL` — `https://3trevo.com.br`
- `FROM_EMAIL` — `sac@3trevo.com.br`

## Arquivos ignorados pelo git

Os seguintes arquivos **não fazem parte deste repositório** por conterem dados sensíveis ou serem de uso interno:

- `admin.html` — painel administrativo (uso local apenas)
- `config.json` — configurações internas (dados vivem no Supabase)
- `progresso.json` — dados de arrecadação (calculado via Supabase)

## Contato

sac@3trevo.com.br
