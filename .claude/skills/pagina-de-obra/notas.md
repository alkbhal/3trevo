# Notas — correções da skill (a mais nova em cima)

## 30/10/2026
- **Medição nas páginas de obra**: o gerador põe `<html data-versao="clean">` e o `js/beacon.js` com `data-sem-popup` (mede só depois do aceite de cookies, sem o pop-up de cadastro). Prepara o teste clean × suave.

## 28/10/2026
- **Capa escura sobre o topo escuro** (Isa, Isma e Tintim): a borda da capa sumia no computador; a prova passava. Camada: processo (faltava olhar as capturas). Mudança: contorno claro de 1px na capa, no molde (Livre regenerada junto); passo 5 do SKILL.md manda olhar as capturas.
- **Preço em duas tabelas**: Antifalência (`catalogo` 29,90 × `products` 46,04) e 3ª Guerra (35,00 × 76,74) divergem no banco de produção. Camada: prova. Mudança: conferir as duas tabelas antes de publicar; a decisão do preço é do dono.
- **Gerador**: a página clean passa a sair de `gerar-pagina-obra.py` + `obras/<slug>.json`, conferido byte a byte com Livre das Dívidas.

## 27/10/2026
- **PR mergeado só com o 1º commit** (#31): a correção do Nema e o visual clean ficaram fora do ar e entraram no #32. Mudança: antes de pedir o merge, conferir que o head do PR é o último commit; depois do merge, comparar o `main` com a branch.
- **Nema prometido como desconto** nas 4 obras ("10% do que você paga volta como desconto"). Camada: processo (regra nunca escrita). Mudança: regra em `regras-de-tom.md` e em Decisões do SKILL.md.
- **Texto vazando da caixa do preço em 360px**, a prova passava. Camada: prova. Mudança: a prova confere texto dentro da própria caixa e botões flutuantes sobre texto também no computador.
- **Aviso de cookies tapando o botão em celular baixo** (360×640, 375×667). Camada: prova. Mudança: a prova mede a primeira tela com e sem o aviso; o molde compacta o topo abaixo de 700px de altura.
- **Botão do WhatsApp sobre o texto** (celular) e sobre o selo "CDC Art.49" (computador). Mudança: no celular vai para a barra fixa; no computador o rodapé ganha recuo.
- **Trilha quebrando em várias linhas no celular** em todas as obras antigas. Mudança: trilha numa linha, com reticências.
- **Ruído jurídico no texto** ("CDC art. 49", "SSL", câmbio N$ na página de venda). Mudança: trava no `site-check`.

## 26/10/2026 — pergunta 8 respondida (entrevista encerrada)
- Relato do dono, da auditoria do site: âncoras do FAQ que não levavam ao destino; vídeo de ~7,5 MB tocando sozinho na área principal; contraste abaixo da WCAG; quadros com renderização instável; aviso de cookies cobrindo conteúdo. Mudança: seção "Página ruim" e "Antes de alterar" no SKILL.md; a prova passa a conferir âncoras e peso de vídeo/arquivos. Renderização instável continua sem conferência automática (conferir à vista no celular).
