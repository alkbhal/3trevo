---
name: pagina-de-obra
description: "Usar para criar, refazer ou publicar a página de uma obra no site 3trevo.com.br (obra/<slug>.html, e depois en/ e es/), quando um livro sai do forge ou ganha nova edição, ou quando o dono pede 'página da obra', 'subir o livro novo', 'página de venda do livro'. Não usar para capa (skill de capa do forge) nem para o catálogo inteiro."
---

# Página de obra

**Pra que serve:** transformar um livro pronto no forge numa página de venda em PT (e, quando o mercado pedir, EN/ES) no padrão visual e de prova da editora, sem o dono refazer o design à mão.

## Quando usar
- O forge entregou um livro (webhook `forge-delivery` criou o produto em rascunho, `ativo=false`).
- Uma obra ganhou edição nova (capa, texto ou idioma).
- O dono pede para refazer uma página antiga no padrão atual.

## O que precisa
| Item | De onde vem |
|---|---|
| Título, autor, sinopse | pacote do forge (`worker/src/routes/forge-webhook.ts`) → tabela `products` |
| Preço | admin (`/api/admin/catalogo`); a página e o JSON-LD têm de bater com ele |
| Capa 600×900 JPG | forge (skill de capa, separada) → `assets/capas/<slug>.jpg` |
| Extensão, formato, faixa etária, números do livro | o próprio PDF/EPUB entregue; nada inventado |
| Nota de mercado (0 a 10) por idioma | motor de mercado do forge. **Hoje não aparece em lugar nenhum** — ver Casos |
| Molde | `obra/livre-das-dividas.html` (B+C clean, aprovado em 27/10/2026) |

## Regra dos idiomas (decisão do dono)
- Escala 0 a 10. **PT a partir de 6,5. EN e ES a partir de 8.** Alemão segue a regra estrangeira (8) quando o site tiver frontend em alemão.
- PT vai sempre primeiro: é o idioma em que o dono revisa.
- **PT:** a página para no PR e espera o aval do dono.
- **EN/ES:** publica sozinha se a nota for ≥ 8 **e** a prova inteira passar; qualquer conferência falhando → para e espera o dono.

## Página ruim (resposta do dono, 26/10/2026)
Página ruim não é a feia: é a que atrapalha o objetivo dela. É ruim quando:
- o visitante não entende rápido o que está sendo oferecido;
- a promessa não bate com o produto ou com a entrega;
- a ação principal é difícil de achar ou de executar;
- há informação contraditória, preço inconsistente ou condição escondida;
- elementos visuais competem e atrapalham a leitura;
- o conteúdo é ilegível ou inacessível para parte do público;
- demora para carregar ou trava (ex.: vídeo pesado tocando sozinho);
- botão, link (ex.: âncora que não leva ao destino), formulário ou componente não funciona;
- aviso, banner ou janela cobre conteúdo importante;
- mede, coleta ou transmite dados sem respeitar a privacidade;
- o código muda sem controle de escopo, sem teste ou sem como verificar o resultado.

**Regra de qualidade:** código alterado ou captura bonita não é "pronto". Só está validada a página cujos critérios de aceitação foram verificados e cujas falhas relevantes foram corrigidas ou registradas.

## Antes de alterar
1. Identificar o objetivo da página e a ação principal.
2. Ler a implementação atual antes de propor mudança.
3. Registrar os problemas vistos, separando fato de hipótese.
4. Escrever os critérios de aceitação verificáveis.
5. Ficar no escopo autorizado, sem mudança colateral.

## Passos
1. Conferir a nota de mercado do idioma contra o corte. Sem nota visível → declarar "não conferível" e parar no PR.
2. Trocar o slug `forge-xxxxxxxx` por um slug legível (sem acento, com hífen) no admin.
3. Copiar o molde `obra/livre-das-dividas.html` para `obra/<slug>.html` e trocar só o conteúdo: `<title>`, meta description, og:*, canonical, os dois JSON-LD (Book com preço; BreadcrumbList), trilha, gênero, título, autor/ano, **uma frase de promessa** no topo, o resto da sinopse em `.obra-lead`, os 3 números de `.ficha`, preço, links de checkout (`/checkout.html?slug=<slug>`), WhatsApp, "Detalhes do ebook", "Para quem é".
4. Não mexer no CSS do molde. Mudança de visual é decisão do dono e vale para todas as obras.
5. Registrar a página: `PAGINAS_OBRA` em `catalogo.html`, `sitemap.xml`, sugestão na `area-cliente.html`.
6. Rodar `node scripts/i18n.mjs`, `node scripts/stamp.mjs`, depois as checagens do CI e a prova (seção "Pronto quando").
7. Deploy azul/verde (`docs/DEPLOY_AZUL_VERDE.md`): marcar `azul-AAAAMMDD` a partir do `main` no ar, PR, CI verde, aval do dono (PT), merge, conferir "Verificação pós-deploy".

## Decisões
- **Texto:** a página vende o livro, a história e a experiência. Lei, número de artigo, sigla técnica e mecânica de pontos ficam nos Termos e nas regras. Ver `arquivos/regras-de-tom.md`.
- **Nema:** é a moeda da editora (símbolo N$; no visual, N com o 3 cortado só nas pontas). **Nunca prometer desconto.** Usar o saldo depende do regulamento da ação.
- **Números da ficha:** só números que estão no livro entregue. Sem número comprovável, a ficha sai com menos itens, nunca com número inventado.
- **Visual:** identidade verde e dourado, clean. Só o botão de compra é dourado cheio. Ver as leis de UX em `arquivos/regras-de-tom.md`.
- **Depoimento, estrela, número de leitores:** só se real e aprovado (regra do `gate-site-tt`).

## Pronto quando
Rodar e mostrar uma linha por conferência (passou / falhou / não conferido, com a prova):
1. `node scripts/stamp.mjs --check`, `node scripts/i18n.mjs --check`, `node scripts/site-check.mjs` — todos ok.
2. `arquivos/prova-pagina-obra.js` (Playwright + axe-core) com **0 reprovadas**:
   - primeira tela do celular (360×640, 375×667, 390×844, 412×915), com e sem o aviso de cookies: título, promessa, capa, 3 números, preço e botão sem rolar;
   - nada sobreposto, nenhum texto vazando da caixa, nenhum botão flutuante sobre texto (celular e 1280px);
   - barra fixa escondida com o aviso de cookies aberto e enquanto o botão da primeira tela está à vista;
   - sem rolagem horizontal em 7 larguras;
   - botão de compra abre `/checkout.html?slug=<slug>`;
   - toda âncora `#id` da página leva a um elemento que existe;
   - nenhum vídeo toca sozinho com mais de 1 MB e nenhum arquivo da página passa de 1,5 MB;
   - preço da tela = preço do JSON-LD = preço do admin;
   - acessibilidade WCAG AA: 0 violações.
3. Cada número da ficha aparece no texto da página e no livro entregue.
4. Nenhum "desconto" associado ao Nema; nenhum "CDC", "art.", "SSL" no texto.
5. Listar o que **não** deu para conferir (preço ao vivo da API, PDF, pagamento real) em vez de presumir.

Se mais de duas conferências falharem na primeira rodada: parar e dizer qual passo causou isso, em vez de remendar a página.

## Casos que já deram errado
Ver `notas.md` (o mais novo em cima). Resumo:
- Trilha de navegação quebrando em 3 linhas no celular (todas as obras antigas).
- Botão do WhatsApp em cima do texto (celular) e do selo do rodapé (computador).
- Aviso de cookies tapando o botão de compra em celular baixo.
- Texto vazando da caixa do preço em 360px — a primeira versão da prova não pegava.
- Página escrita prometendo "desconto" com o Nema.
- PR mergeado antes dos últimos commits: a correção ficou fora do ar.
