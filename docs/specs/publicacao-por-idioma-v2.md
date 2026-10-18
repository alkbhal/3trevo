# SPEC — Publicação por idioma na loja 3trevo.com.br

**Versão:** 2 · 14/10/2026 · **Situação:** aprovada pelo dono (D1–D4 e ajustes de preço de 14/10/2026)
**Fonte de verdade:** este arquivo. Mudança de regra = nova versão deste arquivo com a decisão registrada.
**Depende de:**
- segurança A6 publicada (loja #18, forge #3);
- motor de preço `guardiao` 0.4.0 (guardiao #3);
- forge com coleta de mercado e versão nativa (forge #3: `04935cf`, `cd0ec9e`).

## 1. Objetivo

Cada livro que o forge entrega aprovado vira uma **proposta de publicação** na biblioteca do idioma em que foi escrito. A proposta traz o produto, o preço fundamentado e a evidência, e **o dono aprova antes de ir ao ar**. O mesmo vale para as versões nativas em inglês e espanhol. Quando a regra não permite propor, o livro fica em rascunho **com o motivo escrito**.

## 2. Como é hoje

- Cada produto tem um único arquivo e um único preço. O inglês e o espanhol são só tradução do título e da descrição (`titulo_en`, `titulo_es`): troca de idioma da página, não biblioteca nativa.
- O livro que chega do forge vira rascunho com preço R$ 0 e fica parado.

## 3. Decisões do dono (14/10/2026)

| | Decisão |
|---|---|
| **D1 — Moeda** | A referência de mercado é coletada na moeda do mercado: USD (amazon.com) para en-US, EUR (amazon.es) para es-ES. O Guardião converte para BRL pela **PTAX do Banco Central**, gravando taxa, data e fonte. A loja cobra em **BRL pelo Mercado Pago**, com os meios habilitados na conta. São gravados **separadamente**: (a) referência internacional, (b) conversão, (c) preço final em BRL. O recebimento internacional precisa ser **confirmado na conta real** (§9). |
| **D2 — Título nativo** | O forge produz título, descrição e conteúdo no idioma nativo. O portão de qualidade confere o idioma do conteúdo e, em en/es, também do título e da descrição. Divergência reprova o pacote. *Implementado no forge `cd0ec9e`.* |
| **D3 — Supervisionado** | O sistema prepara produto, preço e evidência; **o dono aprova antes de publicar**. As condições de R4 continuam valendo. Depois de **10 produtos aprovados sem falha crítica**, a automação total é reavaliada (nova decisão, nova versão desta spec). |
| **D4 — Acervo atual** | Produtos existentes ficam como estão, na biblioteca pt. Nenhuma migração. |

## 4. Regras

**R1 — Um produto por idioma.** Cada versão (pt-BR, en-US, es-ES) é um produto separado, com arquivo, título, descrição e preço próprios. As versões de uma obra ficam ligadas pela obra-mãe (`parentProjectId` do pacote).

**R2 — Biblioteca nativa.** Em inglês aparecem só livros escritos em inglês; em espanhol, só em espanhol; em português, só em português. Título traduzido não põe livro em outra biblioteca.

**R3 — Preço sempre do motor.** O preço vem de `guardiao/precificacao.js` (0.4.0), a partir dos comparáveis que o forge coletou (`mercado` do pacote) e da política do dono. Nenhuma outra fonte de preço é aceita. Como o motor interpreta a política está detalhado em §5.

**R4 — Condições para virar proposta pronta para aprovação.** Todas ao mesmo tempo:
1. o pacote do forge chegou com **assinatura válida**;
2. o forge declarou o livro **aprovado no portão** (qualidade + idioma, D2);
3. o motor encontrou **pelo menos 5 comparáveis válidos**;
4. o preço cobre o **piso de custo** e o mercado comporta esse piso (piso ≤ p75);
5. o **líquido distribuível está definido**: nenhum componente faltando, inclusive o imposto do regime tributário;
6. para en/es: **cotação PTAX válida** (até 7 dias) para a moeda dos comparáveis.

Com R4 atendido, o produto fica **pronto para aprovação** (`pronto_para_aprovacao`), nunca publicado.

**R5 — Fora disso, rascunho com motivo.** O motivo aparece no painel do administrador em português simples, vindo de `motivos` do motor ou do portão. Exemplo: "só 3 livros comparáveis encontrados (mínimo 5)".

**R6 — Aprovação do dono.** O painel mostra, por proposta: capa, título e descrição no idioma, preço, posição no mercado, comparáveis com link, conversão PTAX (se houver), divisão da venda (§5.3) e insumos ainda estimados. O dono **aprova** (vai ao ar) ou **recusa** (com motivo). A aprovação vale para aquele preço e aquela evidência; mudou o preço, nova aprovação.

**R7 — Registro da decisão.** Cada proposta, aprovação, recusa, publicação e despublicação guarda:
- o preço;
- os comparáveis usados, com link e preço original;
- a cotação (taxa, data, fonte);
- os componentes do líquido;
- o que era estimado;
- a versão da política e do Guardião;
- quem decidiu e quando.

O registro **nunca é reescrito**: mudança vira registro novo. É também a contagem para D3 (10 aprovados sem falha crítica).

**R8 — Aviso.** O dono recebe um e-mail curto a cada proposta pronta para aprovação e a cada livro que ficou em rascunho.

**R9 — Despublicar a qualquer momento.** Despublicar pelo painel é imediato. Livro despublicado **não volta sozinho**, nem com reenvio do forge.

**R10 — Entrega ao comprador.** O comprador recebe o arquivo pela loja (`forge:<id>/<tipo>` resolvido pelo service binding, PR #18). Nunca um link público do forge.

## 5. Preço na prática (como o motor interpreta a política)

### 5.1 Os 5% de custo
O custo de **produção** por exemplar (IA, imagens, pesquisa, armazenamento) não pode passar de 5% do **preço bruto** (o preço cheio da oferta). Taxas do Mercado Pago e impostos **não** entram nesses 5%: ficam registrados à parte, no líquido. O piso do e-book é custo ÷ 5%. Exemplo: custo R$ 0,60 → piso R$ 12,00.

### 5.2 Posição no mercado (o p25 não é obrigação)
O mercado é a lista de comparáveis válidos. O **p25** é o preço abaixo do qual estão 25% deles, a **mediana** o do meio e o **p75** aquele abaixo do qual estão 75%.
- **Autor sem histórico de vendas:** o preço fica **entre o p25 e a mediana**. A nota de qualidade da obra (portão do forge) decide onde: nota 60 ou menos → p25; nota 90 ou mais → mediana; no meio, proporcional. Assim uma obra nova e boa não é jogada no fundo da prateleira, e também não passa da mediana, o que afastaria o leitor que não conhece o autor.
- **Autor com histórico:** entre a mediana e o p75, pela mesma nota.
- **Piso acima desse alvo, mas ≤ p75:** o preço sobe até o piso (ainda é preço de mercado).
- **Piso acima do p75:** o mercado não paga o custo mínimo. **Sem preço, rascunho.**

### 5.3 Líquido distribuível (delimitado)
```
líquido distribuível = valor pago (preço cheio da oferta)
                     − descontos bancados pela loja (cupom)
                     − taxas do meio de pagamento
                     − impostos incidentes
                     − estornos / reembolsos atribuíveis
parcela Nema        = 50% × líquido distribuível
operação            = líquido − parcela Nema
sobra da operação   = operação − custo de produção do exemplar
```
Cada componente é gravado. Componente indefinido → líquido **indefinido**, e nada é repartido. Hoje o caso é o imposto, que depende do regime tributário: enquanto ele não for informado, nenhuma proposta fica pronta. A **quantidade** de Nema correspondente depende da regra de conversão do ecossistema Nema, fora desta spec.

### 5.4 Exemplo calculado pelo motor (guardiao 0.4.0, números ilustrativos)
Livro **en-US**, autor sem histórico, nota de qualidade 80, custo de produção R$ 0,60 por exemplar, taxa de pagamento 4,99%, imposto 6%, estorno 1%, custo fixo do mês R$ 600. Seis comparáveis na amazon.com (US$ 2,99 a 9,99), PTAX US$ 1 = R$ 5,40 (13/10, BCB, ilustrativa).

| Item | Valor |
|---|---|
| Mercado convertido: p25 / mediana / p75 | R$ 22,90 / R$ 29,65 / R$ 36,40 |
| Faixa do autor novo | R$ 22,90 a R$ 29,65; nota 80 → ⅔ do caminho |
| **Preço proposto** | **R$ 27,40** |
| Piso (0,60 ÷ 5%) | R$ 12,00 ✔ |
| Taxa / imposto / estorno | R$ 1,37 / R$ 1,64 / R$ 0,27 |
| **Líquido distribuível** | **R$ 24,11** |
| Parcela Nema (50%) | R$ 12,06 |
| Operação / sobra depois do custo | R$ 12,05 / R$ 11,45 |
| Meta do mês (R$ 600 ÷ 11,45) | 53 vendas |

O mesmo livro **sem o imposto informado** → rascunho: "líquido distribuível indefinido: falta imposto_pct". Com custo de produção R$ 2,00 → piso R$ 40,00 > p75 R$ 36,40 → rascunho: "o mercado não cobre o custo mínimo".

## 6. O que NÃO pode acontecer

- **N1:** produto publicado sem preço do Guardião (inventado, padrão ou R$ 0).
- **N2:** produto publicado sem aprovação do dono (D3).
- **N3:** livro reprovado no portão (qualidade ou idioma) virando proposta.
- **N4:** assinatura inválida criando ou alterando produto.
- **N5:** reenvio do forge duplicando produto, ou republicando livro que o dono tirou do ar.
- **N6:** livro de um idioma aparecendo na biblioteca de outro.
- **N7:** link público do forge chegando ao comprador (R-SEG-01).
- **N8:** decisão sobrescrita: o histórico de cada decisão é preservado.
- **N9:** preço em BRL sem a referência internacional e a cotação gravadas ao lado (en/es).

## 7. Critérios de aceite (cada um vira teste que reprova se a regra quebrar)

1. Pacote pt-BR aprovado, 5 comparáveis bons, imposto definido → proposta **pronta para aprovação** na biblioteca pt, com o preço do motor; **não publicada**.
2. O dono aprova → publicado; registro com aprovação, preço e evidência.
3. Mesmo pacote com 4 comparáveis → rascunho, motivo "mercado insuficiente".
4. Piso acima do p75 → rascunho, motivo "não cobre o custo mínimo".
5. Imposto não informado → rascunho, motivo "líquido distribuível indefinido".
6. Versão en-US → produto separado, ligado à obra-mãe, só na biblioteca en; preço em BRL com referência USD e PTAX gravadas.
7. Comparáveis en sem cotação PTAX válida → rascunho.
8. Pacote en com título em português → já reprovado no forge (D2); se chegar, a loja não cria proposta.
9. Pacote reenviado → nenhum produto duplicado; aprovação anterior preservada.
10. Livro despublicado e pacote reenviado → continua fora do ar.
11. Assinatura errada → nada criado nem alterado.
12. A loja nunca devolve link do forge ao comprador (coberto pelo PR #18).
13. Contador de D3: 10 aprovados sem falha crítica gera aviso para reavaliar a automação; **não** liga a automação sozinho.

## 8. Fora desta spec

- Experimentos de preço (disposição a pagar medida em vendas): quando houver vendas.
- Studio: troca da sugestão de IA pelo motor, em spec própria.
- Capa traduzida e marketing por idioma.
- Regra de conversão de reais em Nema.
- Migração do acervo atual (D4: não migra).

## 9. Pendências do dono (sem elas a proposta não fica pronta)

1. **Regime tributário / alíquota sobre a venda** (`impostoPct`). Sem ela, o líquido é indefinido (§5.3).
2. **Mercado Pago, recebimento de comprador do exterior em BRL.** Conferir na conta real, sem compartilhar credenciais:
   - quais meios aparecem no checkout para cartão emitido fora do Brasil;
   - se a conta aceita esses cartões, e com que taxa;
   - uma compra de teste de valor baixo com cartão estrangeiro, para confirmar aprovação e repasse.

   Até essa confirmação, as versões en/es podem ser preparadas e aprovadas, mas o checkout delas fica marcado como "recebimento internacional não confirmado".
3. **Taxa real do Mercado Pago** por meio de pagamento (substitui a estimada) e **taxa de estorno** observada (começa declarada como estimativa).
4. **Custos fixos do mês**: Claude, ChatGPT e a assinatura de US$ 4 ainda não identificada. Valor e moeda de cada um.
5. Publicar, em ordem, A6: `FORGE_API_SECRET` → loja #18 → forge #3 (migrações 003 e 004) → `TAVILY_API_KEY` no `tr3vo-forge-delivery`.
