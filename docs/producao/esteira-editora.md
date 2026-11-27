# Esteira da Editora — Versão 2.0

**Data:** 11/11/2026. **Substitui** a versão 1 do mesmo dia.
**Formato:** apresentação a uma plateia cética. Cada afirmação vem com a fonte ou com o aviso "não verificado".

## 1. A tese, em uma frase

**A editora não precisa de mais sistemas. Precisa que um livro atravesse a casa inteira, do texto ao leitor, sem que ninguém carregue no colo.**

Hoje nenhum livro atravessa. A prova está na seção 5.

## 2. O que a versão 1 errou, e a regra que nasceu de cada erro

| Erro da versão 1 | Regra da versão 2 |
|---|---|
| Diagnostiquei antes de ler o código | **Regra 1 — Ler antes de falar.** Nenhuma afirmação sobre o sistema sem abrir a fonte. |
| Contei um teste como venda | **Regra 2 — Todo número tem fonte, data e dono.** Venda só conta se o pagador for desconhecido. |
| Marquei obra como pronta porque o arquivo existia | **Regra 3 — Abrir a caixa.** "Pronto" é conteúdo conferido, não arquivo presente. |
| Planejei seis frentes ao mesmo tempo | **Regra 4 — Um livro por vez.** O segundo só entra quando o primeiro chegou ao leitor. |
| Entreguei plano em vez de peça funcionando | **Regra 5 — Entrega é algo que o dono usa no celular.** Documento não conta como entrega. |
| Diagnostiquei o Forge sem tê-lo lido | **Regra 6 — O que não foi verificado é dito em voz alta.** Ver seção 9. |

## 3. Os setores e seus agentes

Um **agente** aqui não é um robô solto. É uma tarefa com hora marcada, um mandato escrito e uma lista curta do que pode fazer sozinho. Fora da lista, ele para e pergunta.

| Setor | Agente | Faz sozinho | Só com aval do dono | Pulso |
|---|---|---|---|---|
| **1. Obra** | Editor | Montar EPUB e PDF a partir da fonte canônica; conferir autor, fatos citados e promessas | Mudar o texto; aprovar edição | Obras com edição aprovada |
| **2. Vitrine** | Vitrinista | Montar a página da obra no padrão; rodar a prova da página | Publicar página nova; mudar preço | Obras ativas com página aprovada |
| **3. Aquisição** | Divulgador | Preparar o lote semanal de conteúdo com origem marcada | Publicar nas redes; gastar com anúncio | Visitantes por semana, por origem |
| **4. Venda** | Caixa | Lembrar carrinho abandonado; conferir pagamento | Reembolsar; mudar meio de pagamento | Checkout iniciado → pago |
| **5. Leitura** | Bibliotecário | Liberar o livro; salvar o progresso; avisar se um arquivo não abre | Trocar o arquivo de uma obra | % de compradores que abriram |
| **6. Cliente** | Atendente | E-mails por etapa de leitura; pedir depoimento; sugerir a próxima obra | Responder reclamação; publicar depoimento | Recompra; reembolsos |
| **7. Fiscal** | Escriturário | Registrar cada venda; conciliar com o Mercado Pago; montar o relatório do mês | Emitir nota; falar com o contador | Vendas sem nota |
| **Gestor** | Gerente de ronda | Ler os sete pulsos às 08:00 e 20:00; abrir tarefa para o setor em amarelo | Tudo o que estiver em vermelho | Setores no verde |

**Exemplo prático.** Um cliente paga às 15h, com o dono de serviço. O Caixa confirma o Pix. O Bibliotecário libera o livro e o Atendente envia o acesso. Dois dias depois, o Atendente vê que o livro não foi aberto e manda um lembrete. Às 20h o Gestor registra "1 venda, origem Instagram, livro aberto". O dono lê uma linha.

## 4. A esteira de ferramentas: o caminho de um livro

Oito estações. Em cada uma, a ferramenta que já existe na casa.

| # | Estação | O que acontece | Ferramenta |
|---|---|---|---|
| 1 | **Fonte canônica** | O texto vive em um único documento | Google Drive, pasta "Canônico" da obra |
| 2 | **Composição** | O texto vira EPUB e PDF, com a identidade da obra | Forge + GitHub Actions |
| 3 | **Pacote de lançamento** | Arquivos, capa, ficha e números numa caixa com lista | `manifest.json` validado |
| 4 | **Estoque** | Os arquivos entram no depósito privado | Supabase Storage / Cloudflare R2 |
| 5 | **Vitrine** | Página da obra, catálogo e amostra | Site (GitHub Pages) + skill `pagina-de-obra` |
| 6 | **Caixa** | Pix confirmado, compra registrada, Nema creditado | Worker Cloudflare + Mercado Pago |
| 7 | **Leitura** | Biblioteca, leitor, progresso salvo | `js/leitor.js` + Supabase |
| 8 | **Pós-venda e fiscal** | E-mails, depoimento, registro da nota | Worker (cron) + Resend + banco |

**Tudo na mesma casa:** um repositório, um banco, um servidor. Os agentes conversam pelo banco, não entre si.

## 5. Os portões entre as estações

Nada passa de uma estação para a outra sem o portão abrir. É o que a versão 1 não tinha.

| Portão | Pergunta | Quem confere |
|---|---|---|
| **P1 — Texto** | O autor é Said Anes? Cada dado citado tem fonte que existe? Cada promessa (bônus, série, assinatura) é verdadeira hoje? | Editor + aval do dono |
| **P2 — Pacote** | A caixa tem tudo o que a lista diz? O arquivo é o da edição aprovada? | Validador automático |
| **P3 — Vitrine** | A página passa na prova (`gate-site-tt`)? Preço e situação iguais no banco e na página? | Vitrinista |
| **P4 — Venda** | Uma compra de teste atravessou tudo: Pix, biblioteca, leitura, e-mail, Nema? | Caixa + dono no celular |
| **P5 — Rua** | P1 a P4 abertos para esta obra? | Gestor |

### Exemplo real: o Antifalência, conferido hoje

| O que encontrei | Portão que teria barrado |
|---|---|
| O PDF à venda é de março; as revisões ficaram em "Manuscritos" | P2 |
| A capa do PDF à venda traz o nome civil do dono, não Said Anes | P1 |
| A obra estava ativa numa tabela e inativa em outra | P3 |
| O texto canônico cita números e estudos que não consegui confirmar (por exemplo, "82% das falências", "78% fecharam em 18 meses") | P1 |
| O texto promete bônus por assinatura mensal e uma série de 5 volumes que não existem na loja | P1 |
| A edição consta "aprovada" por uma migração em lote, sem leitura de ninguém | P1 |

**Ação tomada:** o Antifalência foi retirado da vitrine em 11/11, com aval do dono. Reversível.

## 6. A sequência

Sem datas inventadas. Cada etapa tem um critério de pronto; a estimativa de esforço sai ao fim da etapa 0, quando eu souber o tamanho real.

| Etapa | Entrega | Pronto quando |
|---|---|---|
| **0 — Abrir todas as caixas** | Laudo dos 5 títulos ativos: autor na capa, versão do arquivo, promessas, dados citados; leitura do repositório do Forge | Uma tabela com verde ou vermelho por título e por portão |
| **1 — Um livro de ponta a ponta** | Antifalência: pasta "Canônico", texto com fatos conferidos, EPUB e PDF novos, página no padrão, progresso de leitura no servidor, compra de teste | O dono compra no celular, lê, troca de aparelho e continua do mesmo ponto |
| **2 — Repetir** | Os demais títulos pela mesma esteira, um por vez | Cada um com os cinco portões abertos |
| **3 — Abrir a rua** | Conteúdo semanal com origem marcada, amostra grátis como porta de entrada | 300 a 500 visitantes de fora em uma obra, com conversão medida |
| **4 — Ligar o gestor** | Painel dos sete pulsos nas rondas das 08:00 e 20:00 | O resumo cita o número real de cada setor |
| **5 — Pós-venda e fiscal** | E-mails por leitura, depoimentos, registro de nota por venda | Vendas sem nota = 0 |

A etapa 4 pode andar junto com a 1 e a 2, porque só lê dados.

## 7. As perguntas da plateia

**"Quem garante que um agente não quebra a loja de madrugada?"**
Ninguém garante; o desenho limita. Agente não publica nem altera produção sem aval. Toda mudança passa por revisão, teste automático e ponto de volta marcado. Isso já existe no repositório.

**"Hoje você errou seis vezes. Por que confiar na versão 2?"**
Não peça confiança, peça prova. A etapa 1 tem um critério que o dono confere sozinho, no celular, sem depender da minha palavra.

**"E se você sumir amanhã?"**
A casa fica de pé. Código, banco e contas são do dono. O ponto de parada e os manuais por setor ficam no repositório. Outro profissional, ou o próprio dono, retoma dali.

**"Quanto custa manter isso?"**
Não levantei. Entra no laudo da etapa 0, com o custo mensal de cada ferramenta.

**"Por que não vender na Amazon ou na Hotmart, onde já há público?"**
Foi decisão do dono vender só pelo site próprio. O ganho é margem, dados do cliente e independência. O preço é ter de trazer cada visitante. Por isso a etapa 3 existe.

**"Cadê o lucro?"**
Não prometo. O que entrego é a conta: a 1 a 3 compras por 100 visitantes interessados, dez vendas pedem de 500 a 1.000 visitantes. Hoje entram 14 por mês. A etapa 3 transforma essa estimativa em número medido.

**"O que acontece com o dono de serviço e sem sinal?"**
As máquinas com timer seguem: confirmação de pagamento, liberação do livro, e-mails, vigilância. O que exige aval espera na fila do vermelho. Nada se perde; apenas espera.

## 8. O que só o dono faz

1. Aprovar texto e edição de cada obra (portão P1).
2. Publicar nas redes e decidir gasto com anúncio.
3. Falar com o contador sobre a nota por venda.
4. Dar o aval de cada publicação em produção.

## 9. O que eu ainda não verifiquei

- O repositório do Forge. Todo o diagnóstico da estação 2 é hipótese.
- Os outros cinco títulos ativos: autor na capa, versão, promessas.
- Se a página ao vivo ainda exibe promessa de prêmio.
- Se o crédito de Nema funciona numa compra real.
- O custo mensal das ferramentas.
- A exatidão dos dados citados no texto do Antifalência. Não os confirmei nem desmenti.
