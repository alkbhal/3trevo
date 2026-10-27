# Nema — modelo de adesão (dono, 27/10/2026) e plano de construção

## Modelo definido pelo dono

**Nema é a moeda da editora (N$), não promessa de desconto.** Usar o saldo depende de aceitar o regulamento aplicável.

1. **Camada geral (adesão):** no primeiro acesso ao Nema, o leitor aceita o Regulamento Geral, uma vez por versão. O regulamento cobre: o que é o Nema e para que serve; como receber; saldo e histórico; modalidades de uso; campanhas; validade, expiração e cancelamento; direitos e responsabilidades; comunicação de mudanças. Sem novo aceite a cada visita ou operação rotineira.
2. **Camada de campanhas:** cada campanha tem regulamento próprio, ligado ao geral, e informa antes da participação: identificação e objetivo; vigência; forma de participação; critérios de pontuação; quantidade de Nema por atividade; valor de referência; limites de concessão e de uso; combinação com dinheiro ou outras vantagens; restrições de uso do saldo; encerramento e cancelamento. O aceite específico só é pedido quando a campanha traz condições que o geral não cobre. Abrir a página não é aceitar.
3. **Camada de uso (modalidades):** abatimento parcial no preço de um livro, Nema + Pix/cartão, campanhas por atividade, combinação de vantagens quando permitida. Cada modalidade informa limites, equivalência e condições. Sem novo aceite a cada compra coberta pelas regras já aceitas.

Rascunho do texto: `regulamento-geral-v1-rascunho.md` (para revisão jurídica; não publicar).
Símbolo: N com o 3 cortado só nas pontas (opção C), referência em `simbolo-n3.html`.

## O que já existe (`supabase/nema.sql`, `worker/src/routes/nema.ts`)
- Extrato que só acrescenta linhas; saldo = soma.
- Um crédito por compra e uma reserva por pagamento (índices únicos).
- Trava por leitor no checkout (advisory lock), transações nas funções.
- RLS: o leitor lê só o próprio extrato; só o worker (service role) movimenta.
- Webhook de pagamento com assinatura validada (fail-closed).
- Regra atual ("fase 0", commit `89c4854`): 10% do valor pago, N$ 1 = R$ 0,50, carência de 7 dias, abatimento de até metade do preço (mínimo de R$ 1,00 cobrado), reserva de 120 minutos, estorno na devolução.

## O que falta (gate de produção N2)
| Item | Hoje | Construir |
|---|---|---|
| Regulamento versionado | não existe | tabela de versões (versão, vigência, texto/hash) |
| Aceite por versão | não existe | tabela de aceites (leitor, versão, data e hora, origem), única por leitor+versão; `nema_reservar` recusa sem aceite da versão vigente |
| Histórico na área do cliente | só saldo | lista de movimentos com data, origem e situação |
| Campanhas | não existe | ficha com os 10 campos, regulamento próprio, `exige_aceite`; crédito único por atividade (índice único campanha+leitor+atividade); aceites de campanha |
| Modalidades | uma fixa no código | a atual vira a "modalidade padrão" do regulamento; parâmetros já em `nema_parametros` |
| Liga/desliga do uso do saldo | não existe | parâmetro `resgate_ativo` lido por `nema_reservar` |
| Backup com restauração testada | não conferível daqui | confirmar no painel do Supabase |

## Decisões do dono (26/10/2026)
- **Regra central:** o Nema não é sinônimo de desconto. É unidade de valor e de participação do ecossistema; o uso depende das regras gerais aceitas e das condições de cada campanha. Adesão uma vez; campanhas variam conforme regras informadas antes.
- **Regulamento v1:** saldo não expira enquanto o programa estiver ativo (campanha pode ter prazo próprio para Nema promocional, informado antes e nunca retroativo); contestação em 90 dias corridos da disponibilização no extrato, preservados os direitos legais; aviso de 30 dias para alteração material desfavorável; 90 dias após exclusão da conta para regularizar ou destinar o saldo, sem confisco automático; aviso de 90 dias para encerramento, com regras de uso ou liquidação. Incorporado em `regulamento-geral-v1-rascunho.md`; falta a redação jurídica definitiva.
- **Saldos existentes:** preservados. Aceite explícito da v1 (versão, data e hora, participante) antes da próxima operação. Consulta de saldo e histórico livre sem aceite; usar, movimentar ou gerar Nema exige aceite. Recusa não confisca. Nada retroativo.
- **Comunicação:** três conceitos — **Nema** (unidade de valor), **Campanha** (ação que define geração e uso), **Benefício** (vantagem da campanha, pode incluir desconto quando previsto). Eliminar "Nema = desconto" na home, em `nema.html`, em EN/ES (títulos, descrições, botões, FAQ, metadados, mensagens de erro, telas de aceite, campanhas). EN/ES preservam o conceito, sem traduzir "desconto" para manter textos antigos.
  - Home — título: "Nema: valor que circula dentro do ecossistema Três Trevo." Descrição: "Participe de campanhas, acumule Nemas conforme as regras de cada ação e utilize seus créditos nas oportunidades disponíveis. Cada campanha informa como participar, como os Nemas são calculados e quais condições se aplicam ao seu uso." Chamada: "Conheça o Nema e suas campanhas."
  - `nema.html`: "O Nema é a unidade de valor utilizada no ecossistema Três Trevo. Sua geração e utilização seguem as regras gerais do programa e as condições específicas de cada campanha. Antes de participar, consulte os critérios de concessão, os limites, os benefícios disponíveis e as condições de utilização. A quantidade de Nemas associada a uma compra ou ação não deve ser presumida: cada campanha precisa apresentar sua regra de cálculo."
- **Símbolo (opção C, encerrado):** entregar versão principal, monocromática, variantes para fundo claro e escuro, tamanho mínimo legível e arquivo vetorial; usar na área do cliente, admin, extratos e campanhas. Não sugerir moeda oficial nem ativo resgatável em dinheiro.
- **Medidor próprio (`js/beacon.js`):** respeita a escolha de cookies. Antes do aceite, só o estritamente necessário; recusa → página funcional e sem medição analítica; escolha registrada e respeitada; separar métricas agregadas que dispensem consentimento das que usam identificador. Validar com LGPD/ANPD. Hoje o beacon grava `_tt_anon` e envia eventos sem esperar o aceite: precisa mudar antes de ir para as páginas de obra.
- **Teste do verde:** clean × suave nas páginas de obra, com o resto constante. Critérios: contraste, legibilidade no celular, hierarquia, facilidade de achar a ação principal, peso do verde, desempenho e estabilidade. Decide pelo resultado.
- **Fluxo de engenharia:** decisão → regra → requisito → esquema de dados → implementação → teste → evidência. Nenhuma alteração de saldo ou mudança irreversível sem validação e trilha de auditoria.

## Fases aprovadas (cada fase = um PR que para no aval do dono)
1. **Fundação:** revisar o modelo de dados; versões do regulamento; aceite (versão, data e hora, participante); preservar o histórico; liga/desliga do uso do saldo; `nema_reservar` e o crédito de compra recusam sem aceite da versão vigente; consulta livre. Migração aditiva, saldos intactos, tudo auditável.
2. **Motor de campanhas:** ficha com os 10 campos; regras de geração, uso, limites, validade e combinações; a compra de e-book vira a campanha permanente; crédito único por atividade.
3. **Interfaces:** aceite e extrato na área do cliente; admin para regulamento e campanhas; home, `nema.html`, checkout e EN/ES reescritos; símbolo C.
4. **Validação:** fluxos completos — aceite, recusa, saldo preexistente, alteração de campanha, contestação, encerramento e falhas operacionais — com evidência.

## Pendências
| Frente | Situação | Próximo passo |
|---|---|---|
| Redação jurídica do Regulamento v1 | decisões incorporadas; 3 marcas [JURÍDICO] | jurídico |
| Fases 1 a 4 do Nema | aprovadas; não iniciadas | fase 1 |
| Home, `nema.html` e EN/ES ainda dizem "desconto" | textos-base definidos | fase 3 |
| Símbolo C (arquivos vetoriais e variantes) | aprovado | fase 3 |
| Beacon respeitando o consentimento | decidido | PR próprio, antes do teste do verde |
| Teste clean × suave | critérios definidos | depois do beacon |
| Isa, Antifalência e Justiça(mento) no visual clean | só o texto foi atualizado | skill `pagina-de-obra` |
| Esteira forge → site (nota de mercado visível, slug legível, biblioteca de manuscritos, painel no admin, EN/ES) | identificado | projeto do forge |
| Skill de capa no forge | decidido que será separada | projeto do forge |
| Home: `assets/hero-reel.mp4` (7,5 MB) começa a tocar sozinho no celular (conferido em 27/10 com Playwright; o JS dá play, `preload="none"` não impede) | confirmado | PR próprio: versão leve ou pôster estático no celular, conferido pela prova (limite de 1 MB para vídeo automático) |
| Home: âncoras do FAQ (relato da auditoria) | as 17 âncoras da home levam a destinos que existem no código atual | conferir no aparelho em que o problema apareceu |
