# Deploy azul/verde (blue-green) — Editora Três Trevo

**Azul** é a versão no ar. **Verde** é a versão nova. A troca só acontece depois da
aprovação do dono, e voltar para o azul é um clique.

## Site (GitHub Pages, branch `main`)

1. **Marcar o azul**: antes de cada troca, crie a branch `azul-AAAAMMDD` a partir do
   `main` que está no ar (`git push origin origin/main:refs/heads/azul-20261018`). Não
   faça commits nela: é só a marca da versão boa.
2. **Montar o verde**: branch `verde-AAAAMMDD` e PR para `main`. O CI (`stamp-check` +
   testes do worker) precisa passar. Anexe ao PR as capturas em tela de celular das
   telas alteradas.
3. **Trocar**: fazer o merge do PR. O Pages republica em cerca de 1 minuto e o workflow
   **Verificação pós-deploy** confere as páginas e os JS/CSS. Se falhar, ele abre uma issue.
4. **Voltar ao azul**: Actions → **Reverter produção** → Run workflow → `alvo` = a branch
   azul. Isso cria um commit novo no `main` com o conteúdo do azul, sem reescrever o histórico.

## Banco (Supabase)

Na mesma troca, só entram mudanças **aditivas** que funcionam com o azul e o verde
(policy nova, coluna nova). Aplique antes do merge. Cada script em `scripts/` traz a
linha de reversão no fim.

## API (Cloudflare Worker `tres-trevo-api`)

O Worker usa versões, não branches. Os comandos rodam em `worker/`:

```bash
npx wrangler versions upload                      # sobe o verde sem tráfego
npx wrangler versions deploy <verde>@10% <azul>@90%   # canário
npx wrangler versions deploy <verde>@100%         # troca
npx wrangler rollback <azul>                      # volta ao azul
```

O workflow **Health Check** (a cada 6h) e o `/api/health/status` confirmam a saúde.

## Histórico

| Data | Azul (antes) | Verde (depois) | O que mudou |
|---|---|---|---|
| 18/10/2026 | `azul-20261018` | PR `verde-20261018` | Leitor novo, música liberada na CSP, capas tipográficas, banner de clássicos condicional, Nema como pontos, policy dos produtos comprados |
| 18/10/2026 | `azul-20261018b` | PR `verde-20261018-membros` | Área de membros grátis: pop-up e /gratis criam a conta, amostra em EPUB, 1 clássico por membro (tabela `leitura_livre` + função `livre-epub`), cartão do Nema |
| 18/10/2026 | `azul-20261018b` | PR `verde-20261018-idiomas` (inclui o de membros) | Três sites (PT, /en/, /es/) gerados do PT por `scripts/i18n.mjs`; estantes de clássicos por idioma (`estante_intl`); privacidade |

## Idiomas (PT, EN, ES)

O português é a fonte. Depois de editar uma página PT:

1. `node scripts/i18n.mjs`: gera `/en/` e `/es/`. Se um texto PT mudou, o script lista as chaves que precisam de tradução nova.
2. Atualize `i18n/en.json` e `i18n/es.json` e rode `node scripts/i18n.mjs --aceitar`.
3. `node scripts/stamp.mjs` e commit.

O CI (`i18n.mjs --check`) barra o deploy se faltar tradução, se o PT mudou depois da tradução ou se aparecer português em página EN/ES.

