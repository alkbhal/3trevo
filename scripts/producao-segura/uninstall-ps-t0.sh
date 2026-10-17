#!/usr/bin/env bash
# Produção Segura T0 — desinstalador.
# Remove apenas o hook com o marcador T0 e restaura o hook anterior salvo.
# Mantém .producao-segura/ (configuração e verificador) para inspeção.
set -euo pipefail

MARKER="# producao-segura-t0-hook"
die() { echo "[PS-T0][UNINSTALL] ERRO: $*" >&2; exit 1; }

git rev-parse --show-toplevel >/dev/null 2>&1 || die "execute dentro de um repositório Git"
hooks_dir="$(git rev-parse --git-path hooks)"
hook="$hooks_dir/pre-commit"
backup="$hooks_dir/pre-commit.ps-t0-backup"

if [ -e "$hook" ] && ! grep -qF "$MARKER" "$hook"; then
  die "o hook atual não é do T0; nada foi alterado"
fi
rm -f "$hook"
echo "[PS-T0][UNINSTALL] hook T0 removido"
if [ -e "$backup" ]; then
  mv "$backup" "$hook"
  echo "[PS-T0][UNINSTALL] hook anterior restaurado"
fi
