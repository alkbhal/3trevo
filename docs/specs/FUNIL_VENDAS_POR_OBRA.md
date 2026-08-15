# Funil de Vendas por Obra — Editora Três Trevo

> Documento de análise externa. Escrito pra ser lido por alguém sem contexto da conversa que o
> gerou — cada decisão vem com o motivo, não só o resultado. Objetivo explícito do Rogério (dono
> do produto): submeter esta solução a uma segunda opinião, porque a interface como está hoje
> pareceu a ele fraca em conversão. Este documento não esconde essa dúvida — ela está registrada
> na seção 6, com a tensão de fundo nomeada.

## 1. O que é a Editora Três Trevo

Editora digital brasileira (`3trevo.com.br`, CNPJ 18.928.966/0001-59, sede em Montauri/RS).
Vende ebooks (hoje 11 títulos ativos) via checkout próprio com Mercado Pago. Cada compra também
dá participação num "Programa Cultural" — sorteio regulado (Lei 5.768/71 até junho/2026, migrado
depois pra RNG interno puro) com prêmios de R$500 a R$6.000, financiado pay-as-you-go pelas
próprias vendas.

**Restrição de marca inegociável, já fixada antes deste projeto:** paleta creme `#f4efe5` +
verde-escuro `#0f2d1a` + dourado `#c8a84b`, tipografia Lora (serif) + Poppins (sans), sem emoji no
conteúdo do site. Tom: editora séria, não "site de sorteio disfarçado" — o site já passou por uma
correção de posicionamento numa sessão anterior, depois de uma análise externa apontar que a
primeira dobra competia identidade de editora com identidade de loteria.

## 2. O que foi pedido nesta rodada

Três pedidos do Rogério, nesta ordem:
1. Automação de diagnóstico + recuperação de carrinho abandonado, pra aumentar conversão.
2. Redesenho do checkout num funil por obra (uma experiência de venda por título), com uma seção
   de degustação (amostra grátis), pensado pra escalar — hoje 11 títulos, potencialmente centenas.
3. Revisão por agentes especializados dos pontos de design a melhorar, depois de construído.

Ele trouxe 2 modelos de referência (`landing-antifalencia.html`, `area-leitor.html`) — HTML/CSS
gerados externamente — como material de intenção, não como spec pra copiar direto.

## 3. O que foi CONSTRUÍDO e está no ar (Fase 1+2 do plano)

### 3.1 Recuperação de carrinho — mecanismo

- `checkout.ts` grava, no momento em que alguém inicia o checkout (antes do Mercado Pago),
  um lead + um evento `checkout_start` com o título que a pessoa estava comprando. Não existia
  nenhum sinal de abandono de carrinho antes desta sessão — o checkout ao vivo não gravava nada
  até o pagamento ser aprovado.
- Um cron novo (`cart-recovery.ts`) roda de hora em hora: acha quem iniciou checkout há mais de
  2h sem comprar, confere se a pessoa já comprou QUALQUER título nesse meio-tempo (se sim, não
  manda nada — decisão deliberada de nunca soar como quem não sabe que a pessoa já é cliente), e
  agenda 2 e-mails.
- O envio reaproveita o motor de e-mail que já existia pra outra finalidade (nutrição de leads
  captados por pop-up) — reconfere de novo se a pessoa comprou entre o agendamento e o envio.

### 3.2 Os 2 e-mails — conteúdo completo, pra avaliação de conversão

Isso é a parte que interessa pra quem for revisar conversão. Copy e HTML abaixo são exatamente o
que está ativo hoje em `email_templates` (tabela do banco), aprovados pelo Rogério e testados com
envio real.

**E-mail 1 — dispara 2h após abandono**
Assunto: `{{nome}}, seu acesso a {{titulo}} ainda está aberto`
Pré-header: "O link continua disponível. Conclua quando quiser."

Estrutura do corpo:
1. Saudação (`{{nome}},`)
2. "Você iniciou a compra de **{{titulo}}** e não concluiu."
3. "Se foi apenas falta de tempo, o acesso continua disponível."
4. Bloco de benefícios (fundo verde-claro, borda esquerda verde): "Entrega imediata por e-mail e
   WhatsApp" / "Garantia de 7 dias (CDC art. 49)"
5. Botão CTA verde-escuro: "Concluir minha compra →"
6. "Qualquer dúvida antes de decidir, é só responder este e-mail."
7. Assinatura: "Editora Três Trevo · Montauri / RS"
8. Rodapé verde-escuro: CNPJ + link de descadastro

**E-mail 2 — dispara 24h após abandono**
Assunto: `Último aviso: {{titulo}} ainda está reservado para você`
Pré-header: "Depois deste e-mail não insistiremos."

Estrutura do corpo:
1. Saudação
2. "Seu acesso a **{{titulo}}** continua disponível."
3. "Não vamos insistir depois deste e-mail — só queríamos garantir que você viu."
4. Caixa de nota (fundo neutro, texto centralizado): "Este é o último lembrete. O link permanece
   aberto por tempo limitado."
5. Botão CTA: "Ver e finalizar →"
6. Linha de confiança: "Entrega imediata · Garantia de 7 dias"
7. Assinatura + rodapé, igual ao e-mail 1.

**Identidade visual (email, não o site):** header/footer verde-escuro `#0a1f0e`, botão `#1e5c3a`,
acento de bloco `#2d7a50`, corpo em Georgia/Times New Roman (tom literário), 600px de largura,
sans-serif só no botão e rodapé.

### 3.3 O que foi deliberadamente cortado dessa versão, e por quê

- **Nenhuma prova social** (review, depoimento, contador de "X pessoas compraram") — porque não
  existe prova social real vinculada a cada título ainda (ver seção 5), e a regra do projeto é
  nunca fabricar depoimento.
- **Nenhuma urgência artificial** (contagem regressiva, "só hoje", estoque fake) — a única
  urgência textual ("tempo limitado" no e-mail 2) é deliberadamente vaga porque não há um prazo
  real por trás; o modelo de referência do próprio Rogério tinha um "48H" fixo sem mecanismo
  nenhum atrás, removido nesta sessão por ser literalmente escassez fabricada.
- **Sem menção ao Programa Cultural (sorteio)** nos e-mails — o modelo de referência tinha
  "Qualifica para o Programa Cultural" como frase fixa; foi cortado porque a regra do projeto é
  que essa menção só pode aparecer quando existe uma Rodada de sorteio realmente aberta no
  momento do envio, nunca como afirmação estática. Esse bloco condicional ainda não foi construído
  (é a Fase 3, abaixo) — por enquanto, os e-mails simplesmente não mencionam o Programa Cultural.
- **Sem imagem do produto/capa do livro** — os templates são só texto + botão, nenhuma arte.

## 4. O que foi PLANEJADO mas ainda NÃO construído (Fase 3)

Isso é provavelmente o que o Rogério tinha em mente ao dizer "na UI me pareceu não converter
bem" — a interface de venda por obra ainda não existe de verdade. Hoje:

- Só 2 dos 11 títulos têm página de venda própria (`obra/antifalencia.html`,
  `obra/justicamento.html`) — as outras 9 obras vendem só pelo card do catálogo geral +
  checkout direto, sem página de vendas dedicada.
- As 2 páginas que existem são HTML estático escrito à mão, sem degustação (nenhum link pra
  amostra de leitura), sem prova social, sem menção dinâmica ao Programa Cultural.
- Existe uma degustação funcional (modal com texto real do primeiro capítulo) pra 5 títulos, mas
  ela vive numa página desconectada (`biblioteca.html`) que nenhuma página de venda linka.

**Arquitetura decidida pra Fase 3** (não construída): em vez de escrever uma página completa por
título (não escala pra centenas de obras) ou um template 100% renderizado por JavaScript (perde
SEO e preview de link em redes sociais), a decisão foi um meio-termo: um arquivo pequeno por
título (só `<head>`/metadados) + 1 template JS/CSS compartilhado que busca o conteúdo de cada obra
num "banco de referência" (coluna nova no banco, ainda não criada) — degustação, causas/pontos de
dor, capítulos, bônus, todos por obra. Mudar a estrutura da página = editar o template uma vez,
não centenas de arquivos.

## 5. Peças que já existem no sistema mas estão desconectadas

Achado relevante pra quem for analisar conversão: várias peças de um funil mais forte já existem
no código, só não estão ligadas às páginas de venda:
- **Depoimentos reais**: existe uma tabela de depoimentos com moderação (aprovado/reprovado),
  vinculada a cada título por slug, com política de leitura pública já liberada — só falta o
  filtro por título no endpoint e ligar a página de venda nela.
- **Degustação real**: texto real do primeiro capítulo de 5 títulos já escrito e funcional, só
  vive numa página órfã.
- **Progresso do Programa Cultural**: campo de meta/valor arrecadado já existe e já é exibido em
  outra página do site — só não está nas páginas de venda por título.

## 6. A tensão de fundo — o ponto pra revisão externa avaliar

Este é o ponto central pra quem for dar uma segunda opinião: o sistema construído até aqui é
deliberadamente **conservador em técnicas de conversão agressivas** — sem urgência fabricada, sem
prova social falsa, sem gatilho de escassez, tom sóbrio e literário em vez de "e-commerce
padrão". Isso é uma escolha de marca (a editora já foi criticada externamente por parecer
"loteria disfarçada" e corrigiu o posicionamento por causa disso), não um acidente.

**A pergunta em aberto:** essa sobriedade é a razão pela qual a solução "pareceu não converter
bem", ou o problema real é que as peças de conversão legítima (prova social real, degustação
visível, progresso real do incentivo cultural, imagem do produto) simplesmente não foram ligadas
ainda às páginas de venda (Fase 3, ainda não construída)? A hipótese deste documento é a segunda —
mas vale uma leitura crítica externa antes de decidir se o caminho é "adicionar mais gatilho de
conversão" ou "terminar de conectar o que já existe, sem gatilho fabricado".

## 7. Perguntas específicas pra quem for revisar

1. Os 2 e-mails de recuperação têm estrutura persuasiva suficiente sem recorrer a urgência
   artificial ou prova social fabricada? O que falta que seja legítimo (não fabricado)?
2. A ausência total de imagem/capa do livro nos e-mails prejudica a conversão o bastante pra
   justificar o custo de adicionar?
3. A arquitetura "casco + template compartilhado" pra páginas de obra é a escolha certa pra
   conversão, ou um template único perde nuance por título que uma página 100% sob medida
   capturaria melhor (ao custo de não escalar)?
4. Dado que o Programa Cultural (sorteio) só pode aparecer condicionado a uma Rodada realmente
   aberta — isso é subaproveitamento de um gatilho de conversão real (ganhar um prêmio), ou é o
   nível certo de cautela dado o histórico de crítica externa sobre "parecer loteria"?

## 8. Estado técnico (pra quem for validar tecnicamente, não só o texto)

- Commit: `3748633` (`github.com/alkbhal/3trevo`), branch `main`.
- Plano completo desta sessão: `C:\Users\User\.claude\plans\parallel-pondering-corbato.md`
  (não versionado no repo, é arquivo local de planejamento).
- Migrações de banco aplicadas: `add_tag_to_email_sequence`, `widen_email_sequence_step_check`
  (correção de bug real que travava silenciosamente o sistema de nutrição já existente, achado
  durante o teste desta feature).
- Templates de e-mail: tabela `email_templates`, tags `recovery_1`/`recovery_2`.
