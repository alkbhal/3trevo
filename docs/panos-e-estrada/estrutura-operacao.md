# Panos e Estrada — Estrutura da Operação Autônoma (v0.1, desenho)

**Data:** 18/11/2026. **Situação:** desenho, sem nada construído. Este arquivo mora no repositório da editora só até o Panos e Estrada ter repositório próprio; depois, mudar para lá.
**Base:** o modelo "empresa-ia-v2" e a adaptação já feita para a editora (`docs/producao/empresa-ia-editora.md`). Mesma regra: **a máquina decide por regra; a IA só escreve.**

## 1. O que eu sei e o que estou supondo

**Dito pelo dono (18/11/2026):**
- O dono faz a execução no mundo físico: compra e busca a carga de mercadorias, vende e prospecta presencialmente.
- Todo o resto deve ficar automatizado: demandas que chegam pelas redes sociais, gestão das redes, administrativo e contabilidade.
- Quando volta da estrada, tudo deve estar pronto, com um relatório detalhado da saúde e da situação da operação.

**Suposto, a confirmar (seção 9):** que "panos" são tecidos, roupas ou cama, mesa e banho; que a venda é para lojistas e consumidores finais; que há períodos sem sinal de celular na estrada; que hoje o controle de estoque e de caixa é feito à mão ou em planilha. Nada abaixo depende de a suposição estar certa: muda o conteúdo do cadastro, não a estrutura.

## 2. A diferença para a editora

Na editora o produto é digital e a máquina entrega sozinha. No Panos e Estrada **o produto anda no caminhão com você**. Por isso o desenho tem uma peça que a editora não tem:

**Você é o sensor de campo.** O que acontece na estrada (comprei, vendi, entreguei, recebi, o lojista pediu) precisa entrar no sistema sem formulário: uma mensagem de voz ou uma foto no WhatsApp, a qualquer hora, e o sistema transforma em lançamento. Se não houver sinal, a mensagem sai quando o sinal voltar e o lançamento fica com a hora em que foi gravada.

## 3. Os times e os agentes

```
          VOCÊ NA ESTRADA  (compra, vende, prospecta, entrega)
             │  voz · foto · "vendi 20 peças pra Loja X"
             ▼
   ┌── CAMPO: Diário de Bordo (transforma voz/foto em lançamento) ──┐
   │                                                                 │
   │      BARRAMENTO de eventos  +  fila PARA APROVAR  +  Guardião  │
   │                                                                 │
   ├─ VENDAS ──────┬─ REDES ───────┬─ ESTOQUE ────┬─ FINANCEIRO ─────┤
   │ Recepção      │ Pauta         │ Almoxarife   │ Caixa            │
   │ Carteira      │ Vitrine       │ Compras      │ Cobrança         │
   │ Rota          │               │              │ Escriturário     │
   └───────────────┴───────────────┴──────────────┴──────────────────┘
             ▲
   GERENTE DE RONDA: relatório de volta da estrada + resumo diário
```

| # | Time | Agente | Faz sozinho (nível 1) | IA? |
|---|---|---|---|---|
| 00 | Coordenação | **Ronda** | Lê os eventos, aplica inibições, chama o agente certo | Não |
| 01 | Campo | **Diário de Bordo** | Transcreve seu áudio, lê a foto (nota, romaneio, comprovante de Pix), propõe o lançamento e pede um "ok" quando houver dúvida | Sim |
| 02 | Vendas | **Recepção** | Responde DM do Instagram, WhatsApp e Facebook: preço da tabela, foto do produto, disponibilidade no estoque, quando você passa na cidade | Sim |
| 03 | Vendas | **Carteira** | Mantém a ficha de cada cliente e lojista: o que compra, de quanto em quanto tempo, quanto deve, cidade. Avisa quem está "na hora de repor" | Não |
| 04 | Vendas | **Rota** | Monta a lista de visitas da próxima viagem por cidade: clientes para repor, pedidos a entregar, contatos novos para prospectar, avisa os clientes de que você passa | Sim, para o aviso |
| 05 | Redes | **Pauta** | Lote semanal de posts a partir das fotos da carga nova e das perguntas mais feitas na Recepção | Sim |
| 06 | Redes | **Vitrine** | Catálogo de produtos com foto, preço e estoque, que a Recepção usa para responder e que pode virar link de catálogo no WhatsApp | Não |
| 07 | Estoque | **Almoxarife** | Baixa estoque a cada venda lançada, avisa o que está acabando e o que está parado há mais de 60 dias | Não |
| 08 | Estoque | **Compras** | Na véspera de buscar carga: lista do que repor, por quantidade vendida nas últimas semanas, e o caixa disponível para isso | Não |
| 09 | Financeiro | **Caixa** | Concilia Pix e cartão com as vendas lançadas, todo dia | Não |
| 10 | Financeiro | **Cobrança** | Lembrete educado de fiado/boleto vencido; para quem tem reclamação aberta, não cobra | Sim, para redigir |
| 11 | Financeiro | **Escriturário** | Organiza notas de compra e venda, separa despesas da estrada (combustível, pedágio, alimentação), monta o pacote mensal do contador | Não |
| 12 | Coordenação | **Gerente de ronda** | Relatório de volta da estrada + resumo diário; fila Para Aprovar | Sim, só redação |
| 13 | Coordenação | **Guardião** | Barra preço fora da tabela, promessa de prazo sem estoque, dado de um cliente indo para outro, desconto acima da alçada | Não |

## 4. Matriz de alçada (valores a definir com você)

| Nível | Ações |
|---|---|
| **1 — Sozinho, registra** | Responder com preço e estoque do cadastro; mandar foto e catálogo; avisar clientes da rota; baixar estoque de venda lançada por você; conciliar Pix que bate; lembrete de vencimento no dia |
| **2 — Um toque** | Publicar o lote de posts; desconto até __%; vender fiado/prazo para cliente com histórico bom; cobrança de vencido há mais de 3 dias; lançamento do Diário de Bordo que a máquina não entendeu com certeza; lista de compras da próxima carga |
| **3 — Dupla confirmação** | Mudar preço de tabela; desconto acima de __%; fiado para cliente novo ou acima de R$ ____; negativar ou protestar; qualquer pagamento a fornecedor; qualquer coisa enviada ao contador como definitiva |

## 5. Inibições cruzadas

1. Cliente com reclamação ou troca aberta → sem cobrança e sem oferta até resolver.
2. Cliente com débito vencido há mais de __ dias → Recepção não oferece prazo; só à vista.
3. Produto com estoque zero → Recepção oferece encomenda para a próxima viagem, nunca promete entrega.
4. Você em viagem → os itens nível 2 e 3 se acumulam e chegam juntos no relatório de volta. Nada "urgente" é decidido pela máquina no seu lugar; o que não pode esperar vira ligação para você.

## 6. Modo estrada

- **Sem sinal:** nada se perde. Respostas de nível 1 seguem pelo servidor (não dependem do seu celular). Seus áudios saem quando o sinal volta.
- **Uma linha por dia na estrada:** "Ontem: 4 vendas na rota (R$ ___), 12 DMs respondidas, 2 pedidos para quinta. Nada urgente." Só isso, para não te distrair dirigindo.
- **Volante:** nenhuma mensagem pede resposta imediata. O Para Aprovar espera você parar.

## 7. O relatório de volta da estrada

Pedido por você com uma palavra ("voltei") ou automático quando o Diário de Bordo registra a última entrega da viagem.

```
PANOS E ESTRADA · VOLTA DA VIAGEM 12–15/11
VENDAS      38 vendas · R$ _____ · 9 na rua, 29 pelas redes
            Melhor cidade: ____ · Melhor produto: ____
CAIXA       Entrou R$ ____ · saiu R$ ____ (carga R$ ____, estrada R$ ____)
            Conferido 100% · 2 Pix sem venda vinculada (ver DECIDA)
A RECEBER   R$ ____ em 6 clientes · 1 vencido há 9 dias
ESTOQUE     Acabando: 3 itens · Parado > 60 dias: 5 itens (R$ ____ empatado)
REDES       5 posts publicados · 47 conversas · 11 viraram venda
PRÓXIMA     Rota sugerida: ____ → ____ (14 clientes para repor, 3 contatos novos)
            Lista de compra sugerida: R$ ____ cabe no caixa? sim
DECIDA      5 itens → painel
SAÚDE       Vendas 🟢 · Redes 🟢 · Estoque 🟡 · Caixa 🟢 · A receber 🟡 · Fiscal 🔴 (4 notas faltando)
```

## 8. Base técnica

O mesmo esqueleto da editora, para reaproveitar código e manutenção:
- **Banco:** Supabase próprio do Panos e Estrada (separado do da editora; clientes e caixa não se misturam). Mesmas tabelas `agent_events`, `approval_queue` e `agent_audit_logs`, mais `clientes`, `produtos`, `estoque_mov`, `vendas`, `recebiveis`, `despesas`, `viagens`.
- **Servidor:** Worker Cloudflare com cron e webhooks (WhatsApp, Instagram, Pix).
- **WhatsApp:** Cloud API oficial, número comercial próprio. Nunca gateway não oficial: o número é o balcão da loja.
- **Redes:** Instagram e Facebook pela API oficial da Meta (exige conta comercial).
- **Painel:** página no celular com senha + código de 6 dígitos, como na editora.
- **Contador:** pacote mensal (planilha + notas) por e-mail ou pasta compartilhada; a máquina não emite nada sozinha.

## 9. Perguntas para fechar o desenho

1. O que exatamente é vendido, e quantos produtos diferentes existem (aproximado)?
2. Quem compra: lojistas, consumidor final ou os dois? Em quais cidades/regiões?
3. Como se recebe hoje: Pix, cartão (qual maquininha), dinheiro, fiado, boleto?
4. Há CNPJ? Qual regime (MEI, Simples)? Há contador?
5. Onde está hoje o controle de estoque, clientes e caixa (caderno, planilha, sistema)?
6. Quais redes têm conta: Instagram, Facebook, WhatsApp Business? Com que número?
7. De quanto em quanto tempo é cada viagem e quantos dias dura?
8. Quais são os valores das lacunas `__` da matriz (seção 4)?

## 10. Prazo

Começa **depois** que a editora estiver vendendo (etapa 21 da editora) e com o barramento pronto (etapa 22), porque o esqueleto será o mesmo.

| Fase | Entrega | Construção |
|---|---|---|
| A | Respostas da seção 9 + cadastro inicial (produtos, clientes, saldo de estoque) importado da planilha/caderno | 1 semana (depende de você enviar os dados) |
| B | Diário de Bordo (voz/foto → lançamento) + Almoxarife + Caixa + relatório de volta | 2,5 semanas |
| C | Recepção nas redes + Vitrine + Guardião | 2 semanas (+ prazo da Meta para o número comercial) |
| D | Carteira + Rota + Compras | 1,5 semana |
| E | Pauta das redes + Cobrança + Escriturário | 2 semanas |

**Total:** 9 a 10 semanas de construção, aproveitando a base da editora. Cada fase entra com prova: a fase B, por exemplo, só está pronta quando uma viagem real tiver sido registrada por áudio e o relatório de volta bater com o seu caderno.
