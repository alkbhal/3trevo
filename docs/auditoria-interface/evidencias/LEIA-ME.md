# Evidências da auditoria — como reproduzir e o que cuidar

## Conteúdo

- `medicoes.json`: resumo das medições, com as condições de cada uma.
- `resultados_run.json`: saída completa do roteiro principal (`scripts/run.mjs`).
- `scripts/`: roteiros usados. Cada um faz uma medição.

| Script | O que mede | Achado |
|---|---|---|
| `run.mjs` | Carregamento, erros, axe, movimento (CDP), teclado, toque, menus, falha do catálogo, clique no cartão | Vários |
| `salto-ent.mjs` | Revelação após link de âncora e `scrollTo` | F-01 |
| `recupera.mjs` | Revelação após salto e rolagem posterior até o fim | F-01 |
| `percorre.mjs` | Revelação com roda de mouse desde o topo | F-01 (controle) |
| `movimento.mjs` | Quadros e recálculos, padrão e reduzido, 3 execuções cada | F-03 |
| `abertura-foco.mjs` | Abertura por salto e focáveis sem contorno | F-07 |
| `contraste.mjs` | Razões de contraste pelo axe | F-05 |
| `video.mjs` | Pedido do vídeo e controle de pausa | F-02 |
| `p0.mjs` | Páginas P0 em celular, sem erro de página | OK-03 |

## Como rodar

Os scripts foram executados a partir de uma pasta de trabalho fora do repositório. Para reproduzir:

1. Instalar `playwright` no ambiente (o caminho de `createRequire` em cada script aponta para uma pasta com Playwright instalado; ajustar).
2. Instalar `axe-core@4.10.2` e `@supabase/supabase-js@2` numa pasta de bibliotecas. Os scripts apontam para `libs/node_modules`; ajustar o caminho.
3. Rodar `node scripts/<nome>.mjs`, a partir da raiz do repositório. Cada script sobe um servidor local na porta indicada no código.

## Ressalvas de método (lidas nas medições)

- **`scrollTo` com `scroll-behavior: smooth` não é confiável para medir rolagem.** O site define `html { scroll-behavior: smooth }`, e chamadas repetidas de `scrollTo` interrompem umas às outras. Um primeiro teste com esse método pareceu mostrar revelação parcial (opacidade 0,84–0,88), mas o movimento real da página foi menor que o pretendido. **Esse resultado não está registrado como achado.** Os testes válidos usam a roda do mouse (`mouse.wheel`) ou um salto único medido.
- **Os quadros são medidos em renderização por software.** Os valores absolutos não valem para aparelho real; a diferença entre padrão e reduzido é o sinal.
- **Chromium do laboratório não reproduz H.264.** O vídeo do herói não toca aqui. Por isso, a reprodução real fica como pendência (P-02).
- **CDNs bloqueados.** O erro `net::ERR_FAILED` nos registros são pedidos a fontes, gtag e Facebook que o laboratório cortou de propósito. Não são erros do site.
- **Erros `supabase is not defined` apareceram numa primeira rodada.** Eram um artefato do bloqueio do CDN do Supabase. Corrigido servindo a biblioteca localmente. Não são defeito do site.

## Dados brutos para o relatório

- Duração do vídeo: lida do cabeçalho `mvhd` do arquivo `assets/hero-reel.mp4` (10,02 s, 7,48 MB).
- Tamanho da abertura: soma dos cinco JPEG em `assets/abertura/` (196.639 bytes).
