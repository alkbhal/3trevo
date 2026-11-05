// Cenas interativas do "Livre das Dívidas" (formato do protótipo do capítulo 1).
// Cada escolha dá pontos de leitura conforme a prudência — pontos não são dinheiro nem Nema.
// Os números seguem o livro (edição 2026-11) e as regras citadas nele.
const c = (id, label, alvo, pontos, dica) => ({ id, label, target_node_id: alvo, pontos, hint: dica });

export const CENAS = {
  cap1: {
    titulo: 'A fatura chegou', inicio: 'n01',
    nodes: {
      n01: { title: 'A fatura chegou', content_markdown: 'O envelope está sobre a mesa desde ontem. Você sabe o que tem dentro, e talvez por isso ainda não o abriu.\n\nTotal da fatura: **R$ 2.340**. Pagamento mínimo: **R$ 351**. Vencimento: hoje.\n\nNa conta há **R$ 900**. O aluguel, de **R$ 600**, vence em cinco dias.',
        choices: [c('a', 'Separar os R$ 600 do aluguel e ligar para o banco pedindo uma proposta de parcelamento', 'n02a', 40, 'Protege a casa primeiro (capítulo 5)'), c('b', 'Pagar o mínimo agora e resolver o resto depois', 'n02b', 0, 'O resto vai para o rotativo'), c('d', 'Pagar R$ 900 da fatura e ver o que acontece com o aluguel', 'n02c', -10, 'A casa fica descoberta')] },
      n02a: { title: 'Na linha com o banco', content_markdown: 'Vinte minutos de música de espera. A primeira proposta chega rápido: **12 parcelas de R$ 268**.\n\nNa conta, isso dá **R$ 3.216**: quase R$ 900 a mais. A taxa escondida é de cerca de **5,3% ao mês**, perto de 85% ao ano. Bem menos que o rotativo, mas ainda caro.',
        choices: [c('a1', 'Pedir a proposta por escrito, com o CET, e responder amanhã', 'n03', 40, 'Proposta boa vem por escrito'), c('a2', 'Aceitar agora, antes que piore', 'n03', 10, 'Resolve hoje, sem comparar')] },
      n02b: { title: 'Trinta dias depois', content_markdown: 'O mínimo foi pago, mas sobraram R$ 549 para um aluguel de R$ 600.\n\nNa fatura seguinte, os **R$ 1.989** que ficaram para trás custaram **R$ 298,35** de juros, a 15% ao mês. É dinheiro que não comprou nada. E o rotativo só dura um mês: agora o banco tem de oferecer um parcelamento.',
        choices: [c('b1', 'Listar todas as dívidas, uma por uma, antes de aceitar qualquer coisa', 'n03', 30, 'O mapa das dívidas'), c('b2', 'Pegar um empréstimo pessoal para cobrir a fatura', 'n03', -10, 'Troca uma dívida por outra')] },
      n02c: { title: 'O aluguel atrasou', content_markdown: 'A fatura diminuiu, mas o aluguel atrasou, com multa. Sem teto, não há recuperação: é por isso que a moradia vem em primeiro lugar na ordem de pagamento do capítulo 5.',
        choices: [c('c1', 'Refazer as contas e montar o mapa das dívidas', 'n03', 20, 'Começar do diagnóstico')] },
      n03: { title: 'O mapa das dívidas', content_markdown: 'Numa folha, a lista fica assim:\n\n**Cartão:** R$ 2.340, juros altos.\n\n**Crediário da loja:** R$ 640, juros médios.\n\n**Parcela do celular:** R$ 310, sem juros.\n\nVocê consegue separar R$ 400 por mês. Por onde começar?',
        choices: [c('m1', 'Pela dívida de juros mais altos', 'fim', 30, 'Avalanche: paga menos juros'), c('m2', 'Pela menor, para sentir progresso', 'fim', 20, 'Bola de neve: ganha fôlego')] },
      fim: { title: 'O primeiro mês', is_terminal: true, content_markdown: 'O mês termina sem nenhuma dívida a menos. Mas termina com um plano escrito, e isso muda o peso do envelope sobre a mesa.\n\nAs duas ordens funcionam. A avalanche custa menos; a bola de neve ajuda quem precisa de uma vitória rápida. O Ático escolhe pelos seus números.' },
    },
  },
  cap2: {
    titulo: 'A vitrine às 23h', inicio: 'n01',
    nodes: {
      n01: { title: 'A vitrine às 23h', content_markdown: 'Dia difícil. No celular, um fone que você queria há meses: **10 vezes de R$ 50**, "sem juros".\n\nO dedo já está no botão. A frase aparece na cabeça: **"eu mereço"**.',
        choices: [c('a', 'Fechar o aplicativo e esperar 24 horas', 'n02a', 40, 'A anestesia do cartão passa'), c('b', 'Comprar: são só R$ 50 por mês', 'n02b', 0, 'Cultura da parcela')] },
      n02a: { title: 'No dia seguinte', content_markdown: 'De manhã, a vontade é outra. Você nota que já paga **R$ 209** de parcelas por mês.\n\nMais R$ 50 por mês, durante dez meses, são **R$ 500** de um dinheiro que ainda nem chegou.',
        choices: [c('a1', 'Anotar o vício que apareceu: "síndrome do eu mereço"', 'fim', 30, 'Reconhecer é meio caminho'), c('a2', 'Comprar mesmo assim, agora pensado', 'fim', 10, 'Pelo menos foi decisão, não impulso')] },
      n02b: { title: 'Dez faturas', content_markdown: 'Na fatura seguinte, os R$ 50 se somam às outras parcelas. Durante dez meses, o mês já começa com um pedaço do salário comprometido.',
        choices: [c('b1', 'Somar todas as parcelas que já existem e ver o total', 'fim', 20, 'Olhar o número real')] },
      fim: { title: 'O que ficou', is_terminal: true, content_markdown: 'Ninguém se endivida por um fone. Se endivida por cem decisões pequenas tomadas no cansaço. A regra das 24 horas não proíbe nada: só tira a decisão do impulso.' },
    },
  },
  cap3: {
    titulo: 'Carlos e a moto', inicio: 'n01',
    nodes: {
      n01: { title: 'A moto quebrou', content_markdown: 'A fatura do Carlos veio de **R$ 1.000**: tênis, conserto da moto e compras. O mínimo é **R$ 150**. Ele tem R$ 300 sobrando até o salário.',
        choices: [c('a', 'Pagar só o mínimo', 'n02a', 0, 'R$ 850 vão para o rotativo'), c('b', 'Pagar R$ 300 e pedir já um parcelamento do resto, por escrito', 'n02b', 40, 'Menos dinheiro no rotativo')] },
      n02a: { title: 'Um mês de rotativo', content_markdown: 'Os R$ 850 viraram **R$ 977,50** (15% de juros). Na fatura seguinte, ele não pode ficar de novo no rotativo e aceita **12 × R$ 129,71** a 8% ao mês.\n\nTotal pago pela fatura de R$ 1.000: **R$ 1.706,52**. Os juros (R$ 706,52) ficaram abaixo do teto de 100% da lei, mas a conta doeu.',
        choices: [c('a1', 'Conferir na fatura se o teto de 100% foi respeitado', 'fim', 30, 'Lei 14.690/2023'), c('a2', 'Deixar para lá', 'fim', 0, '')] },
      n02b: { title: 'Menos para financiar', content_markdown: 'Com R$ 300 pagos, só **R$ 700** vão para o rotativo: R$ 105 de juros no mês, em vez de R$ 127,50. E a proposta por escrito deixa comparar antes de assinar.',
        choices: [c('b1', 'Guardar o cartão na gaveta até o parcelamento acabar', 'fim', 30, 'Não alimentar a bola de neve')] },
      fim: { title: 'O preço do mínimo', is_terminal: true, content_markdown: 'O mínimo não é o valor da dívida: é o valor para não atrasar. Cada real a mais pago na fatura é um real a menos rendendo 15% ao mês para o banco.' },
    },
  },
  cap5: {
    titulo: 'Dia do pagamento', inicio: 'n01',
    nodes: {
      n01: { title: 'R$ 1.500 na conta', content_markdown: 'Caíram **R$ 1.500**. Aluguel R$ 600, mercado R$ 400, luz e água R$ 150, transporte R$ 100. E o cartão pede **R$ 300** de mínimo.\n\nTotal: R$ 1.550. Faltam R$ 50.',
        choices: [c('a', 'Pagar a base primeiro e deixar o cartão para negociar', 'n02a', 40, 'A ordem do capítulo 5'), c('b', 'Pagar o cartão primeiro, para não sujar o nome', 'n02b', 0, 'A luz fica para depois'), c('d', 'Atrasar o aluguel uma semana', 'n02b', -10, 'Sem teto, não há recuperação')] },
      n02a: { title: 'A base protegida', content_markdown: 'Casa, comida, luz e transporte pagos. Sobram R$ 250 para o cartão. Você liga e pede, por escrito, uma proposta que caiba.',
        choices: [c('a1', 'Usar o script 3 do livro: oferecer um pouco menos do que pode', 'fim', 30, 'Sobra espaço para negociar')] },
      n02b: { title: 'O efeito dominó', content_markdown: 'O cartão continua cobrando juros, e agora uma conta essencial também atrasou, com multa. Duas dívidas no lugar de uma.',
        choices: [c('b1', 'Refazer a ordem: base primeiro, bancos depois', 'fim', 20, '')] },
      fim: { title: 'Escolher comer', is_terminal: true, content_markdown: 'Deixar uma dívida comum para depois, enquanto você protege o essencial e se organiza para negociar, pode ser a decisão certa. Pensão alimentícia e bens em garantia nunca vão para o fim da fila.' },
    },
  },
  cap6: {
    titulo: 'A ligação da cobrança', inicio: 'n01',
    nodes: {
      n01: { title: 'Uma dívida de 4 anos e 8 meses', content_markdown: 'Uma empresa de cobrança liga sobre um cartão antigo. "Para seguir, preciso que o senhor **confirme que reconhece a dívida**."',
        choices: [c('a', '"Antes de qualquer coisa, me mandem por escrito a origem, o contrato e a data do vencimento original"', 'n02a', 40, 'Script 2 do livro'), c('b', '"Reconheço, sim. Quanto fica para pagar?"', 'n02b', 0, 'Pode zerar o prazo de 5 anos'), c('d', 'Desligar e bloquear o número', 'n02c', 10, 'Evita o erro, mas não resolve')] },
      n02a: { title: 'Por escrito', content_markdown: 'O demonstrativo chega: o vencimento original foi há 4 anos e 8 meses. Se você assinar um acordo agora, o credor ganha mais 5 anos para cobrar na Justiça (Código Civil, art. 202).',
        choices: [c('a1', 'Só assinar um acordo que eu consiga cumprir até o fim; na dúvida, Defensoria', 'fim', 40, 'Decisão informada')] },
      n02b: { title: 'O relógio zerou', content_markdown: 'Reconhecer a dívida interrompe a prescrição: a contagem de 5 anos recomeça do zero. Isso não é crime nem erro moral, mas é um direito que você entregou sem saber.',
        choices: [c('b1', 'Pedir agora a proposta por escrito e conferir os 7 itens antes de assinar', 'fim', 20, '')] },
      n02c: { title: 'O problema continua', content_markdown: 'A cobrança volta por outros canais. Ignorar não apaga a dívida, e você perde a chance de saber a data que muda tudo.',
        choices: [c('c1', 'Pedir o Registrato e descobrir a data', 'fim', 30, 'Gratuito, no Banco Central')] },
      fim: { title: 'Quem pergunta, negocia', is_terminal: true, content_markdown: 'Pedir informação não é reconhecer dívida. Os scripts do livro foram escritos para isso: perguntar tudo, por escrito, antes de prometer qualquer coisa.' },
    },
  },
  cap7: {
    titulo: 'Ligaram para o seu chefe', inicio: 'n01',
    nodes: {
      n01: { title: 'Ligaram para o seu chefe', content_markdown: 'O cobrador ligou no telefone da empresa e contou ao seu chefe que você deve. Você sente o rosto queimar.',
        choices: [c('a', 'Anotar data, hora e nome, guardar provas e registrar no consumidor.gov.br', 'fim', 40, 'CDC, art. 42'), c('b', 'Pagar qualquer valor para parar a vergonha', 'fim', 0, 'Acordo no desespero costuma quebrar')] },
      fim: { title: 'A lei está do seu lado', is_terminal: true, content_markdown: 'Na cobrança, o devedor não pode ser exposto ao ridículo nem sofrer constrangimento ou ameaça. Estar devendo não tira os seus direitos.' },
    },
  },
  cap8: {
    titulo: 'Joana fecha a conta', inicio: 'n01',
    nodes: {
      n01: { title: 'Faltam R$ 85,58', content_markdown: 'Joana recebe **R$ 1.499,42** e gasta **R$ 1.585**. O cartão já tem R$ 750. Onde mexer primeiro?',
        choices: [c('a', 'Atacarejo com lista (−R$ 50), celular pré-pago (−R$ 20) e banho mais curto (−R$ 20)', 'n02', 30, 'R$ 90 por mês'), c('b', 'Cortar o lazer inteiro', 'n02', 10, 'Corte que não dura')] },
      n02: { title: 'Só cortar não basta', content_markdown: 'Os gastos caíram para R$ 1.495. Ainda é pouco para negociar o cartão.',
        choices: [c('a1', 'Fazer duas faxinas extras por mês (+R$ 150)', 'fim', 40, 'Renda maior, conta que fecha'), c('a2', 'Pegar um empréstimo para quitar o cartão', 'fim', 0, 'Troca de dívida sem plano')] },
      fim: { title: 'Fase 1 da escada', is_terminal: true, content_markdown: 'Com R$ 154,42 sobrando, Joana negociou 8 × R$ 120 e guardou R$ 30 por mês. Cerca de 91% para o básico, 7% para a dívida, 2% para a reserva. Não é o 70-20-10, e tudo bem: é o primeiro degrau.' },
    },
  },
  cap9: {
    titulo: 'O 13º chegou', inicio: 'n01',
    nodes: {
      n01: { title: 'O 13º chegou', content_markdown: 'Caíram **R$ 1.400** de 13º. A reserva tem R$ 220 e ainda há uma parcela de acordo de R$ 120 por 3 meses.',
        choices: [c('a', 'R$ 300 na reserva, R$ 360 para quitar o acordo e o resto com destino planejado', 'fim', 40, 'Reforça a reserva e quita'), c('b', 'Viagem de fim de ano: eu mereço', 'fim', 0, 'Gatilho de recaída nº 4'), c('d', 'Tudo na reserva', 'fim', 20, 'Seguro, mas o acordo continua')] },
      fim: { title: 'O saldo aparece devagar', is_terminal: true, content_markdown: 'O 13º é a chance de subir um degrau. "Liberdade financeira não é ter muito dinheiro. É não dever a ninguém."' },
    },
  },
};
