# Esteira da Editora — do manuscrito ao pós-venda

**Criado em:** 11/11/2026, a pedido do dono.
**Para que serve:** definir os setores da editora, o que cada um entrega, o número que mostra se está vivo, e como o gestor coordena tudo sem o dono presente.

## 1. O retrato de hoje (medido em 11/11/2026)

| O que | Número | Fonte |
|---|---|---|
| Pessoas no site em 30 dias | 14 | `lead_events` |
| Visitas com origem identificada (UTM) | 0 | `lead_events` |
| Pessoas que chegaram ao checkout em 30 dias | 4 | `lead_events` |
| Pagamentos aprovados desde o início | 1 (Pix, 06/05) — teste do próprio dono | `payments` |
| Vendas para desconhecidos | 0 | `payments` |
| Leads captados desde o início | 8 | `leads` |
| Obras ativas à venda | 6 | `products` |
| Obras ativas sem EPUB (não abrem no leitor) | 1 — A Última Coisa que Ela Disse | `products` |

Ressalva: o medidor só conta quem aceita os cookies, então o número real de visitantes é um pouco maior. A ordem de grandeza não muda.

**Leitura do retrato:** a loja não vende porque quase ninguém chega nela. Nenhuma melhoria de página resolve isso sozinha. O trabalho tem duas frentes que andam juntas: a experiência de leitura (o que o dono pediu) e a chegada de leitores (o que falta para haver venda).

### O que já existe e funciona
- Catálogo, página de obra, checkout próprio com Pix (Mercado Pago), área do cliente com login.
- Leitor da editora (`js/leitor.js`): abre o EPUB com um clique, tamanho de texto, modo noite, lembra a posição.
- Recuperação de carrinho e sequência de e-mails para leads (cron de hora em hora).
- Leitor interativo do Livre das Dívidas com amostra pública.
- Guardião de segurança, CI, deploy azul/verde, health-check.

### O que falta para "clicar e ler como no Kindle"
1. O progresso dos livros **comprados** fica só no aparelho (`localStorage`). Trocou de celular, perdeu. Na Biblioteca de clássicos já vai para o servidor; nos comprados, não.
2. A biblioteca do cliente não mostra "x% lido" nem "Continuar de onde parou".
3. Não existe virar página. O leitor rola por capítulo (decisão de 16/out, porque a paginação cortava títulos no celular).
4. Não existe trilha por capítulo (o que foi lido, o que falta).
5. Uma obra ativa não tem EPUB.

## 2. Os setores

Cada setor é independente: tem entrada, saída, um número de pulso e um dono operacional (automação ou agente). Um setor parado não trava os outros. Eles se falam pelo banco de dados, nunca pelo dono.

| Setor | Recebe | Entrega | Pulso | Quem opera |
|---|---|---|---|---|
| **1. Obra** | Manuscrito e direção do autor | Pacote de lançamento: EPUB, PDF, capa, ficha | Obras ativas com pacote completo (hoje 5 de 6) | Forge (`tr3vo-forge`) |
| **2. Vitrine** | Pacote de lançamento | Página de obra no padrão, catálogo, amostra grátis | Obras ativas com página no padrão (hoje no máximo 2 de 6) | Skill `pagina-de-obra` + `gate-site-tt` |
| **3. Aquisição** | Trechos e temas das obras | Visitantes com origem identificada | Visitantes por semana, por origem | Agente de conteúdo + agendador |
| **4. Venda** | Visitante na página de obra | Pagamento aprovado | Checkout iniciado → pago | Worker `checkout` + recuperação de carrinho |
| **5. Entrega e leitura** | Pagamento aprovado | Livro na biblioteca, aberto no leitor | % de compradores que abriram; % médio lido | Worker + leitor |
| **6. Cliente (pós-venda)** | Compra e progresso de leitura | E-mails no momento certo, depoimento, segunda compra, suporte | Recompra; depoimentos; reembolsos | Motor de e-mail (cron) |
| **7. Fiscal** | Pagamento aprovado | Nota fiscal, conciliação, relatório ao contador | Vendas sem nota (meta: 0) | A definir com o contador |
| **Gestor** | O pulso dos 7 setores | Resumo das 08:00 e 20:00; só sobe o que exige decisão | Setores no verde / no vermelho | Claude (tarefa agendada) |

### Restrições que valem para todos os setores
- Autor público: Said Anes. Nenhum outro nome.
- Venda só para desconhecido. Nada de divulgação no meio militar nem na rede pessoal.
- Sorteio pausado até a regularização. Nenhuma peça de marketing promete prêmio.
- Legibilidade é requisito: corpo grande, entrelinha generosa, texto à esquerda, sem hifenização, contraste alto.
- Nada de sistema novo quando já existe solução validada. Cada obra mantém identidade visual própria.

## 3. Como o gestor coordena

O gestor não executa o trabalho dos setores. Ele lê uma única fonte (`gestor_pulso`, uma visão no banco com uma linha por setor) e aplica três regras:

1. **Verde:** o setor rodou e o número está dentro do esperado. Não sobe nada.
2. **Amarelo:** o número saiu do esperado. O gestor abre a tarefa para o setor e avisa no resumo, sem pedir nada ao dono.
3. **Vermelho:** precisa de decisão ou de algo que só o dono tem (dinheiro, senha, aval, voz do autor). Sobe no resumo com a pergunta pronta e a recomendação.

O dono recebe, em cada resumo: os números dos setores, o que foi feito sozinho e, no máximo, três decisões.

## 4. Fases

Cada fase termina com prova, no ciclo de `plano.md` (branch, CI verde, PR, aval, merge, checkpoint).

### Fase A — Ler como no Kindle (âncora)
| # | Entrega | Pronto quando |
|---|---|---|
| A1 | Progresso dos livros comprados salvo no servidor (posição, % lido, capítulos lidos) | Abrir em outro aparelho volta ao mesmo ponto |
| A2 | Biblioteca com capa grande, barra de progresso e botão "Continuar" | Um toque na capa abre o livro no ponto certo |
| A3 | Modo "virar página" (toque nas bordas e deslizar), ao lado do modo rolagem | Testado em celular pequeno sem cortar título |
| A4 | Trilha de leitura: sumário com capítulos lidos e por ler | Marca atualiza ao concluir um capítulo |
| A5 | EPUB de A Última Coisa que Ela Disse | Abre no leitor |

### Fase B — Vitrine completa
| # | Entrega | Pronto quando |
|---|---|---|
| B1 | Páginas de Antifalência, Justiça(mento), 3ª Guerra e A Última Coisa no padrão | Prova da skill com 0 falhas |
| B2 | Os números de cada livro extraídos do próprio arquivo, para o dono só aprovar | Destrava as etapas 3, 4 e 4b sem trabalho do dono |
| B3 | Cada página de obra com amostra que abre no leitor | "Ler um trecho" funciona sem cadastro |

### Fase C — Pós-venda guiado pela leitura
| # | Entrega | Pronto quando |
|---|---|---|
| C1 | E-mail de acesso na hora da compra, com botão direto para o leitor | Chega em até 2 minutos |
| C2 | Dia 2: se não abriu o livro, lembrete; se abriu, incentivo | Usa o progresso real (A1) |
| C3 | Ao concluir: pedido de depoimento | Depoimento aprovado aparece na página da obra |
| C4 | Dia 14: próxima obra sugerida | Clique medido com origem |
| C5 | Ficha do cliente no admin: compras, leitura, e-mails, contatos | Uma tela por cliente |

### Fase D — Aquisição (satélite, em paralelo com a A)
| # | Entrega | Pronto quando |
|---|---|---|
| D1 | Todo link divulgado sai com origem marcada (UTM) | Nenhuma visita "sem origem" vinda de campanha |
| D2 | Posicionamento novo: a leitura na frente, sem prêmio | `PLANO_CAMPANHA.md` de junho substituído |
| D3 | Lote semanal de conteúdo por obra (trechos, carrosséis, roteiros curtos) pronto para agendar | Dono agenda o lote em uma sessão por semana |
| D4 | Amostra grátis como porta de entrada (e-mail em troca do capítulo) | Taxa de captura medida |
| D5 | Portão de tráfego pago: só abre com 300 visitantes orgânicos medidos e taxa de captura conhecida | Decisão registrada com teto de gasto |

### Fase E — Fiscal
| # | Entrega | Pronto quando |
|---|---|---|
| E1 | Pergunta fechada ao contador: nota por venda de e-book no Lucro Presumido, quem emite e como | Resposta por escrito |
| E2 | Cada pagamento aprovado gera registro em `notas_fiscais` (pendente → emitida) | Vendas sem nota = 0 |
| E3 | Relatório mensal de vendas conciliado com o Mercado Pago, para o Controle RDS | Bate centavo a centavo |

### Fase F — Gestor
| # | Entrega | Pronto quando |
|---|---|---|
| F1 | Visão `gestor_pulso` no banco, uma linha por setor | Números conferidos à mão uma vez |
| F2 | Resumos das 08:00 e 20:00 leem o pulso e aplicam verde/amarelo/vermelho | Resumo cita número real de cada setor |

## 5. Ordem recomendada

1. **A (âncora) + D1 a D3 (satélite)** agora. A resolve o que o dono vê; D resolve o que impede a venda.
2. **F1** logo em seguida, para o resumo diário já mostrar os números.
3. **B e C** quando A estiver no ar (C depende do progresso de A1).
4. **E1** pode ser perguntado ao contador já; E2 e E3 antes de qualquer campanha paga.
5. **Nema:** o crédito por compra já existe no código (`creditarCompraNema` → `nema_creditar_compra`) e a promessa já está pública no site, então os primeiros compradores recebem Nema desde a primeira venda. Falta prová-lo com uma compra de ponta a ponta (entra na etapa 15 como teste). O que fica para depois da décima venda é só o motor de campanhas e as telas novas (etapas 8 a 10). A etapa 7 (aceite do regulamento) segue antes de qualquer campanha paga.

## 6. Marcos

| Marco | Significa |
|---|---|
| 1ª venda para desconhecido com origem identificada | A esteira inteira funcionou uma vez |
| 10 vendas | Dá para ler conversão por obra; reabre o Nema |
| 1ª recompra | O pós-venda funciona |

## 7. O que só o dono pode dar
1. Aval para esta ordem (inclusive adiar o Nema).
2. Uma sessão por semana para agendar o lote de conteúdo nas redes (as contas são dele).
3. A pergunta fiscal ao contador (E1).
4. Aprovar os números de cada livro quando chegarem prontos (B2).
