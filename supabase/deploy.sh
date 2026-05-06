#!/usr/bin/env bash
# =============================================================
# Editora Três Trevo — Script de deploy das Edge Functions
# Uso: chmod +x deploy.sh && ./deploy.sh
# =============================================================

set -euo pipefail

PROJECT_REF="xfkepekffdyrtcgagwqo"
SITE_URL="https://3trevo.com.br"

# ── Cores para output ─────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo ""
echo "  ✦ Editora Três Trevo — Deploy das Edge Functions"
echo "  ================================================="
echo ""

# ── 1. Verificar pré-requisitos ───────────────────────────
if ! command -v supabase &> /dev/null; then
  err "Supabase CLI não encontrado. Instale com: npm install -g supabase"
fi
log "Supabase CLI encontrado: $(supabase --version)"

# ── 2. Login e link ───────────────────────────────────────
warn "Fazendo link com o projeto $PROJECT_REF..."
supabase link --project-ref "$PROJECT_REF" || warn "Já vinculado — continuando..."

# ── 3. Configurar secrets ─────────────────────────────────
echo ""
echo "  Configuração de secrets"
echo "  -----------------------"

# MP_ACCESS_TOKEN
if [ -z "${MP_ACCESS_TOKEN:-}" ]; then
  warn "MP_ACCESS_TOKEN não encontrado no ambiente."
  read -r -p "  Cole o MercadoPago Access Token (produção): " MP_ACCESS_TOKEN
fi
if [ -z "$MP_ACCESS_TOKEN" ]; then
  err "MP_ACCESS_TOKEN é obrigatório."
fi
supabase secrets set MP_ACCESS_TOKEN="$MP_ACCESS_TOKEN"
log "MP_ACCESS_TOKEN configurado"

# SITE_URL
supabase secrets set SITE_URL="$SITE_URL"
log "SITE_URL configurado: $SITE_URL"

# RESEND_API_KEY (opcional)
if [ -z "${RESEND_API_KEY:-}" ]; then
  warn "RESEND_API_KEY não encontrado no ambiente (opcional)."
  read -r -p "  Cole a Resend API Key (Enter para pular): " RESEND_API_KEY
fi
if [ -n "${RESEND_API_KEY:-}" ]; then
  supabase secrets set RESEND_API_KEY="$RESEND_API_KEY"
  log "RESEND_API_KEY configurado"
else
  warn "RESEND_API_KEY não configurado — e-mails não serão enviados até ser adicionado."
fi

# FROM_EMAIL (opcional, padrão sac@3trevo.com.br)
if [ -z "${FROM_EMAIL:-}" ]; then
  FROM_EMAIL="sac@3trevo.com.br"
fi
supabase secrets set FROM_EMAIL="$FROM_EMAIL"
log "FROM_EMAIL configurado: $FROM_EMAIL"

# ── 4. Deploy das Edge Functions ──────────────────────────
echo ""
echo "  Deploy das functions"
echo "  --------------------"
FUNCTIONS=("create-preference" "mp-webhook" "get-download" "validate-entry")

for fn in "${FUNCTIONS[@]}"; do
  echo -n "  → Deploying $fn..."
  supabase functions deploy "$fn" --no-verify-jwt 2>&1 | tail -1
  log "$fn deployed"
done

# ── 5. Resumo ─────────────────────────────────────────────
echo ""
echo "  ✦ Deploy concluído com sucesso!"
echo ""
echo "  Funções disponíveis:"
for fn in "${FUNCTIONS[@]}"; do
  echo "    https://$PROJECT_REF.supabase.co/functions/v1/$fn"
done
echo ""
echo "  Webhook URL para MercadoPago:"
echo "    https://$PROJECT_REF.supabase.co/functions/v1/mp-webhook"
echo ""
echo "  ⚠  Certifique-se de que o domínio do remetente está"
echo "     verificado no Resend antes de usar em produção."
echo ""
