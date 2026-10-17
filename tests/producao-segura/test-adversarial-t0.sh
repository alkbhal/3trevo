#!/usr/bin/env bash
# Produção Segura T0 — suíte adversarial em repositórios temporários.
# Uso: bash tests/producao-segura/test-adversarial-t0.sh
# Cada caso de bloqueio confere: código de saída != 0, motivo esperado no stderr,
# HEAD intacto e, como controle, que o mesmo commit passa com --no-verify
# (prova que o bloqueio veio do hook e não de uma falha alheia).
set -uo pipefail

PKG="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../scripts/producao-segura" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
PASSED=0
FAILED=0

fail_now() { echo "    motivo: $*" >&2; exit 1; }

new_repo() {
  local dir
  dir="$(mktemp -d "$WORK/repo.XXXXXX")"
  cd "$dir" || fail_now "cd $dir"
  git init -q -b main . || fail_now "git init"
  git config user.email t0@example.invalid
  git config user.name "PS T0 Test"
  mkdir -p src docs
  echo base > src/a.txt
  git add src/a.txt && git commit -q --no-verify -m base || fail_now "commit inicial"
}

install_t0() { bash "$PKG/install-ps-t0.sh" >/dev/null 2>&1 || fail_now "instalação falhou"; }

expect_block() { # $1 = tag esperada no stderr
  local before after rc err
  before="$(git rev-parse HEAD)"
  err="$(git commit -q -m tentativa 2>&1 >/dev/null)"; rc=$?
  after="$(git rev-parse HEAD)"
  [ "$rc" -ne 0 ] || fail_now "commit não foi bloqueado"
  [ "$before" = "$after" ] || fail_now "HEAD mudou"
  grep -qF "$1" <<<"$err" || fail_now "motivo esperado '$1' ausente; stderr: $err"
  LAST_ERR="$err"
  git commit -q --no-verify -m controle >/dev/null 2>&1 \
    || fail_now "controle: commit também falha sem o hook (bloqueio não atribuível ao T0)"
}

expect_allow() {
  local before err
  before="$(git rev-parse HEAD)"
  err="$(git commit -q -m permitido 2>&1 >/dev/null)" || fail_now "commit bloqueado indevidamente: $err"
  [ "$before" != "$(git rev-parse HEAD)" ] || fail_now "HEAD não avançou"
}

jwt() { # $1 = role; token sintético montado em tempo de execução
  local h p
  h="$(printf '{"alg":"HS256","typ":"JWT"}' | base64 | tr -d '=\n' | tr '/+' '_-')"
  p="$(printf '{"iss":"supabase","ref":"synthetictest","role":"%s"}' "$1" | base64 | tr -d '=\n' | tr '/+' '_-')"
  printf '%s.%s.%s' "$h" "$p" "c2ludGV0aWNvLXNlbS12YWxvcg"
}

ca01() { new_repo; install_t0; echo x > "fora do escopo.txt"; git add "fora do escopo.txt"
  expect_block "[ESCOPO]"; grep -qF "fora do escopo.txt" <<<"$LAST_ERR" || fail_now "nome com espaço não reportado"; }
ca02() { new_repo; install_t0; local key="AKIA""IOSFODNN7EXAMPLE"
  echo "aws_key = $key" > src/c.txt; git add src/c.txt; expect_block "[SEGREDO]"
  ! grep -qF "$key" <<<"$LAST_ERR" || fail_now "valor do segredo impresso no stderr"; }
ca03() { new_repo; install_t0; rm .producao-segura/project.json
  echo y >> src/a.txt; git add src/a.txt; expect_block "[CONFIG]"; }
ca04() { new_repo; install_t0; echo '{"scope": [' > .producao-segura/project.json
  echo y >> src/a.txt; git add src/a.txt; expect_block "[CONFIG]"; }
ca05() { new_repo; install_t0; echo '{"scope": []}' > .producao-segura/project.json
  echo y >> src/a.txt; git add src/a.txt; expect_block "[CONFIG]"; }
ca06() { new_repo; local key="AKIA""IOSFODNN7EXAMPLE"
  printf 'ok\nkey = %s\n' "$key" > src/old.txt; git add src/old.txt
  git commit -q --no-verify -m legado || fail_now "commit legado"
  install_t0; echo ok > src/old.txt; git add src/old.txt; expect_allow; }
ca07() { new_repo; install_t0; rm .producao-segura/bin/ps-t0-check.py
  echo y >> src/a.txt; git add src/a.txt; expect_block "[VERIFICADOR]"; }
ca08() { new_repo; install_t0; echo z > "src/meu arquivo.txt"; git add "src/meu arquivo.txt"; expect_allow; }
ca09() { new_repo; local hook=.git/hooks/pre-commit
  printf '#!/bin/sh\necho hook-anterior\n' > "$hook"; chmod +x "$hook"; cp "$hook" "$WORK/orig9"
  install_t0; grep -qF producao-segura-t0-hook "$hook" || fail_now "hook T0 não instalado"
  bash "$PKG/uninstall-ps-t0.sh" >/dev/null 2>&1 || fail_now "desinstalação falhou"
  cmp -s "$hook" "$WORK/orig9" || fail_now "hook anterior não restaurado"
  [ ! -e .git/hooks/pre-commit.ps-t0-backup ] || fail_now "backup não consumido"; }
ca10() { new_repo; local hook=.git/hooks/pre-commit
  printf '#!/bin/sh\necho hook-anterior-10\n' > "$hook"; chmod +x "$hook"; cp "$hook" "$WORK/orig10"
  install_t0; install_t0
  cmp -s .git/hooks/pre-commit.ps-t0-backup "$WORK/orig10" || fail_now "backup perdido na reinstalação"
  bash "$PKG/uninstall-ps-t0.sh" >/dev/null 2>&1 || fail_now "desinstalação falhou"
  cmp -s "$hook" "$WORK/orig10" || fail_now "restauração após reinstalação falhou"; }
ca11() { new_repo; local hook=.git/hooks/pre-commit
  printf '#!/bin/sh\ntouch "$(git rev-parse --git-dir)/hook-anterior-rodou"\n' > "$hook"; chmod +x "$hook"
  install_t0; echo y >> src/a.txt; git add src/a.txt; expect_allow
  [ -e .git/hook-anterior-rodou ] || fail_now "hook anterior não foi encadeado"; }
ca12() { new_repo; install_t0
  echo "const anon = '$(jwt anon)';" > src/anon.js; git add src/anon.js; expect_allow
  echo "const sr = '$(jwt service_role)';" > src/sr.js; git add src/sr.js; expect_block "supabase-service-role-jwt"; }
ca13() { new_repo; mkdir -p .producao-segura; echo 'nao-json' > .producao-segura/project.json
  if bash "$PKG/install-ps-t0.sh" >/dev/null 2>&1; then fail_now "instalador aceitou config inválida"; fi
  [ ! -e .git/hooks/pre-commit ] || fail_now "hook instalado apesar da config inválida"; }

run() { # $1 = função, $2 = descrição
  if ( "$1" ); then echo "PASS ${1^^} — $2"; PASSED=$((PASSED+1))
  else echo "FAIL ${1^^} — $2"; FAILED=$((FAILED+1)); fi
}

run ca01 "arquivo fora do escopo (nome com espaço) bloqueado; HEAD intacto"
run ca02 "segredo sintético em linha adicionada bloqueado; valor não impresso"
run ca03 "configuração ausente falha fechada"
run ca04 "configuração JSON malformada falha fechada"
run ca05 "escopo vazio falha fechada"
run ca06 "remoção de segredo antigo permitida"
run ca07 "verificador ausente falha fechada"
run ca08 "arquivo dentro do escopo aceito"
run ca09 "hook anterior restaurado após desinstalação"
run ca10 "reinstalação preserva o backup original"
run ca11 "hook anterior continua executando com o T0 instalado"
run ca12 "JWT anon permitido; JWT service_role bloqueado"
run ca13 "instalador recusa config inválida sem ativar o hook"

echo
echo "Resultado: $PASSED aprovados; $FAILED reprovados."
[ "$FAILED" -eq 0 ]
