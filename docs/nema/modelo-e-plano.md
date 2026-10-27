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

## Ordem (cada fase = um PR que para no aval do dono)
1. **Banco:** versões, aceites, campanhas, liga/desliga, tipo `credito_campanha`. Migração aditiva; saldos existentes intactos.
2. **Worker:** registrar aceite; saldo informa `precisa_aceite`; uso do saldo recusado sem aceite.
3. **Site:** página do Regulamento Geral; `nema.html` reescrita (moeda, sem "desconto"); aceite e histórico na área do cliente; checkout; home; EN/ES; símbolo C.
4. **Admin:** cadastro e publicação de campanhas.

## Decisões pendentes do dono
1. Validade do Nema (proposta: 12 meses, aviso 30 dias antes).
2. Prazo para contestar movimento (proposta: 90 dias).
3. Aviso prévio de mudança no regulamento (proposta: 30 dias).
4. Prazo para usar o saldo ao excluir a conta (proposta: 30 dias) e aviso de encerramento do programa (proposta: 60 dias).
5. Quem já tem saldo: mantém o saldo e aceita a v1 no próximo uso; até aceitar, vê mas não usa (proposta).
6. Manter N$ 1 = R$ 0,50 e o teto de metade do preço como modalidade padrão?
7. Revisão jurídica: uso da palavra "moeda"; campanhas com sorteio/prêmio (Lei 5.768/1971); expiração (CDC art. 51).

## Outras frentes abertas (fora do Nema)
| Frente | Situação | Depende de |
|---|---|---|
| Home, `nema.html` e EN/ES ainda dizem "desconto" | identificado | fase 3 acima |
| Isa, Antifalência e Justiça(mento) no visual clean | só o texto foi atualizado | aplicar a skill `pagina-de-obra` |
| Medição nas páginas de obra (beacon) e teste A/B do verde | planejado | decisão: o `js/beacon.js` grava um id anônimo e envia eventos sem esperar o aceite de cookies, mas o aviso diz que a medição só liga com o aceite — alinhar o texto ou o comportamento |
| Esteira forge → site | página de obra ainda feita à mão; slug `forge-xxxxxxxx`; nota de mercado invisível; sem biblioteca de manuscritos etiquetados nem painel de consulta no admin | projeto do forge |
| Skill de capa no forge | decidido que será separada | projeto do forge |
| Pergunta 8 da entrevista da skill | aberta | resposta do dono → `.claude/skills/pagina-de-obra/notas.md` |
