#!/usr/bin/env bash
# Produção Segura T0 — instalador do hook pre-commit local.
# Uso (dentro do repositório-alvo): bash /caminho/scripts/producao-segura/install-ps-t0.sh
#
# - Cria .producao-segura/project.json somente se ausente (escopo padrão pequeno).
# - Copia o verificador para .producao-segura/bin/ e valida a configuração ANTES de ativar o hook.
# - Hook pre-commit pré-existente é salvo em pre-commit.ps-t0-backup e continua sendo
#   executado depois do T0 (encadeado), para não desativar um controle existente.
# - Reinstalar não sobrescreve o backup original.
set -euo pipefail

MARKER="# producao-segura-t0-hook"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "[PS-T0][INSTALL] ERRO: $*" >&2; exit 1; }

root="$(git rev-parse --show-toplevel 2>/dev/null)" || die "execute dentro de um repositório Git"
cd "$root"
command -v python3 >/dev/null 2>&1 || die "python3 não encontrado"
[ -f "$SRC_DIR/ps-t0-check.py" ] || die "verificador não encontrado em $SRC_DIR"

if [ -n "$(git config --get core.hooksPath || true)" ]; then
  die "core.hooksPath está definido; instalação automática não suportada (evita alterar hooks compartilhados)"
fi
hooks_dir="$(git rev-parse --git-path hooks)"
mkdir -p "$hooks_dir"
hook="$hooks_dir/pre-commit"
backup="$hooks_dir/pre-commit.ps-t0-backup"

mkdir -p .producao-segura/bin
if [ ! -e .producao-segura/project.json ]; then
  cat > .producao-segura/project.json <<'JSON'
{
  "version": 1,
  "scope": ["src/", "docs/", ".producao-segura/"]
}
JSON
  echo "[PS-T0][INSTALL] criado .producao-segura/project.json com escopo padrão; edite 'scope' para este projeto."
fi

tmp_checker="$(mktemp .producao-segura/bin/.ps-t0-check.XXXXXX)"
cp "$SRC_DIR/ps-t0-check.py" "$tmp_checker"
chmod 0755 "$tmp_checker"
mv -f "$tmp_checker" .producao-segura/bin/ps-t0-check.py

python3 .producao-segura/bin/ps-t0-check.py validate-config \
  || die "configuração inválida; hook NÃO instalado"

if [ -e "$hook" ] && ! grep -qF "$MARKER" "$hook"; then
  [ -e "$backup" ] && die "já existe $backup e o hook atual não é do T0; resolva manualmente antes de reinstalar"
  cp -p "$hook" "$backup"
  echo "[PS-T0][INSTALL] hook anterior salvo em $backup"
fi

tmp_hook="$(mktemp "$hooks_dir/.pre-commit.XXXXXX")"
cat > "$tmp_hook" <<HOOK
#!/usr/bin/env bash
$MARKER
set -u
root="\$(git rev-parse --show-toplevel)" || exit 1
checker="\$root/.producao-segura/bin/ps-t0-check.py"
if [ ! -f "\$checker" ]; then
  echo "[PS-T0][VERIFICADOR] BLOQUEADO: verificador ausente: \$checker" >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "[PS-T0][VERIFICADOR] BLOQUEADO: python3 não encontrado" >&2
  exit 1
fi
python3 "\$checker" pre-commit || exit 1
backup="\$(git rev-parse --git-path hooks)/pre-commit.ps-t0-backup"
if [ -x "\$backup" ]; then
  exec "\$backup" "\$@"
fi
exit 0
HOOK
chmod 0755 "$tmp_hook"
mv -f "$tmp_hook" "$hook"
echo "[PS-T0][INSTALL] hook instalado em $hook"
