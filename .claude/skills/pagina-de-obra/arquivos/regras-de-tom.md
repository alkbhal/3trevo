# Regras de tom e de visual — página de obra

## Texto
- O leitor vem pelo livro, pela história e pela experiência. A página fala disso.
- Exigência legal aparece como benefício: "7 dias para ler sem risco", não "CDC art. 49". A lei fica nos Termos.
- CNPJ, cidade e contato continuam no rodapé, em letra pequena (Decreto 7.962/2013).
- Nema = moeda da editora (N$). Nunca "desconto", nunca "volta como desconto". Usar o saldo depende do regulamento da ação.
- Cada informação aparece uma vez. Mecânica (taxa, câmbio, prazo) fica na página de regras, com link.
- Nada de adjetivo sem fato ao lado. Nenhum número que não esteja no livro.
- Barrado no CI (`scripts/site-check.mjs`): "CDC", "art. 49", "Lei nº", "§", "SSL" no texto das páginas de venda.

## Visual (B+C clean, aprovado em 27/10/2026)
- Identidade: verde da marca no topo e na barra fixa; corpo em papel claro; dourado como destaque.
- Título em Playfair Display; promessa em Lora itálico; texto em Poppins.
- Leis de UX:
  - **Hick:** uma ação na primeira tela (comprar). "Ver catálogo" fica no menu e no fim.
  - **Von Restorff:** só o botão de compra é dourado cheio.
  - **Fitts:** botão largo, na altura do polegar; barra fixa só depois que ele sai de vista.
  - **Proximidade:** preço, formato e botão na mesma linha.
  - **Miller:** primeira tela em 4 blocos: capa+título, promessa, 3 números, preço+botão.
  - **Jakob:** capa à esquerda no computador, como nas livrarias online.
  - **Estética-usabilidade:** sem molduras, uma única linha em caixa alta, respiro.
- WhatsApp no celular fica dentro da barra fixa, nunca flutuando sobre o texto.
- Símbolo do Nema: N com o 3 cortado só nas pontas (opção C), traço dourado no escuro, espaço antes do valor; texto acessível "N$". Referência: `docs/nema/simbolo-n3.html`.
