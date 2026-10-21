---
name: gate-site-tt
description: "Usar antes de criar, mudar ou declarar pronta qualquer página do site 3trevo.com.br (home, catálogo, página de obra, checkout, área do cliente, páginas em EN/ES) para checar SEO, conversão, LGPD, acessibilidade, desempenho e verdade da oferta. Complementa o gate-producao-tt, que cuida da engenharia."
---

# Gate do Site TT

Objetivo: nenhuma página vai ao ar sem passar por estes requisitos. O `gate-producao-tt` cuida da engenharia (segredos, RLS, webhooks, rollback); este gate cuida do que o visitante, o Google e as IAs veem.

## Regras da casa (não negociáveis)

- **Identidade do autor:** Said Anes não aparece em foto nem com dados pessoais. O "Sobre" fica sem foto até o dono decidir revelar. Nada de rosto, nome civil ou cidade do autor em página, marcação ou metadado.
- **Só verdade:** depoimento, avaliação, número de leitores e caso de sucesso só se forem reais, com origem no banco (tabela `depoimentos`, estado `aprovado`) e autorização. Seção sem dado real fica oculta. Nunca estrelas sem nota real.
- **Promessa = entrega:** sinopse, extensão, formato, faixa etária e preço da página têm de bater com o livro e com o que o checkout cobra (tabela `catalogo`).
- **LGPD:** Google Analytics e pixel da Meta só pelo `js/consentimento.js`, que carrega depois do "aceito".
- **Três sites:** o PT é a fonte; EN e ES são gerados por `scripts/i18n.mjs`, sem português visível.
- **Publicação azul/verde:** branch `verde-*`, PR, CI verde, aval do dono, merge, verificação pós-deploy.

## Checklist

Marque cada item como OK, FALTA ou N/A, com o motivo. **[auto]** = o CI já barra; os demais exigem conferência.

### 1. Ser encontrado (SEO e IA)
1. Título único por página, até ~60 caracteres. [auto]
2. Meta description de 50 a 160 caracteres, que funcione como anúncio. [auto]
3. Canonical e hreflang (PT/EN/ES) corretos; o gerador i18n cuida nas páginas traduzidas.
4. `og:image`, `og:title` e `og:description`; página de obra usa a capa. [auto: og:image]
5. Marcação estruturada: Organization na home, FAQPage onde há perguntas, Book e BreadcrumbList nas páginas de obra; JSON-LD válido. [auto]
6. Página indexável listada no `sitemap.xml`; área logada, checkout e admin em `noindex` e no `robots.txt`. [auto: sitemap]
7. Conteúdo importante legível sem JavaScript (o que o JS monta precisa existir também em marcação ou JSON-LD).
8. Links internos: cada página importante recebe link de outra (home e catálogo → páginas de obra).
9. URLs estáveis; ao renomear ou remover uma página, criar redirecionamento.

### 2. Converter (venda)
10. CTA principal visível antes de rolar, no celular e no computador.
11. CTA fixo no celular nas páginas de venda, sem cobrir conteúdo nem o aviso de cookies.
12. Preço exibido = preço cobrado (`catalogo`), inclusive no JSON-LD.
13. Página de obrigado após o pagamento e evento de compra (`TTConsent.evento('purchase', …)`), uma vez por pagamento.
14. Prazo de resposta visível: "Respondemos em até 48 horas".
15. Garantia e reembolso claros (CDC art. 49, 7 dias).
16. Prova social real (item "Só verdade"); sem dado real, a seção não aparece.
17. FAQ com as dúvidas reais de compra (entrega, Nema, reembolso).
18. Página 404 própria, com caminho de volta (início e catálogo).

### 3. Confiar (legal e LGPD)
19. Link para a política de privacidade em toda página pública. [auto]
20. Aviso de cookies; nada de rastreio antes do "aceito". [auto]
21. CNPJ, cidade e contato (e-mail e WhatsApp) no rodapé.
22. Termos e regulamentos linkados onde há campanha, sorteio ou Nema.
23. Formulário que coleta dado: base legal, finalidade e consentimento separado para e-mail de novidades.

### 4. Funcionar para todos (acessibilidade)
24. Toda imagem com `alt` (decorativa com `alt=""`). [auto]
25. Contraste legível; foco visível no teclado; botões com texto ou `aria-label`.
26. `lang` correto no `<html>`; hierarquia de títulos (um `h1` por página).
27. Sem rolagem horizontal em 390 px; alvos de toque com ≥ 44 px.

### 5. Carregar rápido (desempenho)
28. Imagens no tamanho certo (capa web 600×900, ≤ 100 KB); `loading="lazy"` abaixo da dobra.
29. JS e CSS com `?v=hash` (`scripts/stamp.mjs`). [auto]
30. Vídeo e scripts de terceiros sem bloquear a primeira tela (`defer`, `preload="none"`).
31. Sem dependência de domínio que a CSP bloqueia (conferir no console).

### 6. Segurança da página
32. CSP coerente com o que a página carrega (Supabase, Worker, Google, Meta só onde há consentimento).
33. Nada de chave secreta no HTML (a chave anon do Supabase é pública, a service_role nunca).
34. Links externos com `rel="noopener"`.

### 7. Depois de publicar
35. A verificação pós-deploy passou (páginas 200, JS/CSS carregando).
36. Abrir a página no celular e no computador e conferir o primeiro quadro.
37. Se algo quebrou: Actions → Reverter produção → o azul do dia.

## Como rodar

```bash
node scripts/stamp.mjs --check      # cache dos JS/CSS
node scripts/i18n.mjs --check       # PT, EN e ES em sincronia
node scripts/site-check.mjs         # itens [auto] deste gate
```

## Relatório

Tabela: item | status (OK / FALTA / N/A + motivo) | risco se faltar | correção proposta.

- Antes de marcar FALTA, procurar a estrutura existente (banco, Worker, admin, CSS). Estrutura pronta e vazia por falta de dado real é **OK (aguardando dado)**, não FALTA.
- FALTA nos blocos 2, 3 ou 6 bloqueia a publicação.
- Para cada FALTA, entregar a correção pronta, não só apontar.
- Frases curtas, sem jargão.
