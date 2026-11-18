# Editora Três Trevo — Operação Autônoma v2.0 (adaptação do modelo "empresa-ia-v2")

**Data:** 18/11/2026. **Complementa** `esteira-editora.md` (setores e portões) e vira as etapas 21 a 26 do `plano.md`.
**Regra deste documento:** cada afirmação sobre o sistema foi conferida no repositório nesta data. O que não foi conferido está na seção 12.

## 1. A decisão em uma frase

**A máquina decide por regra; a IA só escreve.** Toda decisão de "pode ou não pode" (alçada, inibição, valor, prazo) é código testado no worker. O modelo de linguagem entra só para redigir a resposta, a pauta ou o resumo, e o texto dele passa por um validador antes de sair.

## 2. O que aproveitar do modelo genérico e o que trocar

| No modelo genérico | Problema para a editora | Na Três Trevo |
|---|---|---|
| Servidor próprio rodando `claude -p` em laço a cada 15 s | 5.760 chamadas por dia mesmo sem nada a fazer; mais uma máquina para manter, atualizar e proteger | **Worker Cloudflare que já existe**, com cron (hoje de hora em hora, em `worker/src/index.ts`) + chamada direta à API do Claude (`ANTHROPIC_KEY` já configurada). A IA só é chamada quando há evento. |
| WhatsApp pela Evolution API | Não é oficial; o número pode ser banido pela Meta, e o número da editora é o canal de venda | **WhatsApp Cloud API oficial**, que já está em `worker/src/notify.ts` (com e-mail Resend como reserva) |
| Painel Next.js com chave anônima fazendo `UPDATE` em `approval_queue` | Qualquer pessoa com a chave anônima (que é pública, vai no navegador) aprovaria reembolso | **Aba "Para Aprovar" no `admin.html`**, falando só com rota do worker protegida pela sessão de admin (`admin_sessoes`, senha PBKDF2) + 2FA. Tabela fechada por RLS, sem política para anon/authenticated |
| Hook `PreToolUse` com `validate_outbound.py` | Só vale numa sessão do Claude Code; em produção não roda. E a regex `desconto de 20%` deixa passar "20% de desconto" | **`validarSaida()` no worker**, chamada antes de todo envio, lendo campos estruturados (valor, %, prazo, obra) e não o texto solto. Testada como o resto do worker |
| `.mcp.json` com `./secrets/gcp-oauth.json` | Arquivo de segredo dentro do projeto | Segredos só como secrets do Cloudflare/GitHub. Nada no repositório |
| Tabela `contacts` com `phone NOT NULL` | A editora vende por e-mail; muitos leitores nunca dão telefone | Identidade = `profiles`/`clientes` (e-mail, user_id). Telefone opcional, só com consentimento |
| `embedding VECTOR(1536)` em cada contato | Com 14 visitas no mês não há volume que justifique; custo e LGPD sem ganho | **Linha do tempo do cliente** (eventos + compras + progresso de leitura). Busca vetorial fica para depois de 500 clientes |
| `financial_ledger` novo | Duplica `payments`, `purchases` e `pedidos`, que já existem | **View `v_caixa`** sobre as tabelas existentes |
| Orquestrador LLM decide inibições | A IA pode errar a regra | Inibição é SQL; o orquestrador é código |
| Qualificador, Agendador, Cobrança | E-book de R$ 20–35, pago à vista no Pix: não há reunião nem fatura vencida | Trocados por Bibliotecário, Recuperação de Pix e Escriturário (seção 3) |

**Mantido do modelo:** barramento de eventos, fila de aprovação com 3 níveis, registro de auditoria por agente, payload com `antes`/`depois` para desfazer em um toque, resumo das 07:30, inibição cruzada.

## 3. Os agentes da editora

Doze funções, nenhuma solta. Cada agente é um arquivo em `worker/src/agentes/` com: mandato (o texto que a IA recebe), lista do que faz sozinho, nível de alçada de cada ação e teste.

| # | Agente | Equivalente no vídeo | Faz | Já existe hoje | IA? |
|---|---|---|---|---|---|
| 00 | **Ronda** (orquestrador) | Orchestrator | Lê `agent_events` pendentes, aplica inibições, chama o agente certo, marca `done`/`failed` | Não | Não: código puro |
| 01 | **Recepção** | SDR | Responde no WhatsApp, Instagram e e-mail: dúvida sobre obra, preço, formato, "serve para mim?". Envia amostra grátis e link do checkout com UTM | Não | Sim, modelo rápido |
| 02 | **Leitor-perfil** | Qualificador | Marca o interesse de cada pessoa (obra, tema, capítulo onde parou a amostra) para os e-mails | Parcial: `leads`, `lead_events` | Não |
| 03 | **Caixa** | Caixa do Dia | Confirma Pix (webhook MP), confere `payments` × `purchases` todo dia às 08:00, aponta divergência | Parcial: `mp-webhook`, teste `valor-divergente` | Não |
| 04 | **Recuperação** | Cobrança | Lembra carrinho e Pix não pago, respeitando a janela 22h–8h | **Sim**: `cron/cart-recovery.ts`, `janela-envio.ts` | Não |
| 05 | **Bibliotecário** | (não há) | Libera o livro, salva progresso, avisa se um arquivo não abre, reenvia acesso | Parcial: biblioteca, `/api/leitura` | Não |
| 06 | **Atendente** | Suporte | "Não chegou o acesso", "não abre", "quero meu dinheiro de volta". Reenvio é nível 1; reembolso segue a matriz | Não | Sim, modelo de raciocínio |
| 07 | **Acompanhante** | Pós-venda | E-mail por etapa de leitura, pedido de depoimento ao concluir, sugestão da próxima obra | Parcial: `cron/email-engine.ts` (sequência por lead) | Sim, rápido |
| 08 | **Divulgador-pauta** | Social Media | Lote semanal de 5 posts a partir de trechos aprovados das obras + dúvidas da Recepção | Parcial: `admin-ai-studio.ts` | Sim, raciocínio |
| 09 | **Divulgador-medição** | Gestor de Tráfego | Origem de cada venda (UTM → compra), envio à API de Conversões da Meta, pausa de anúncio só com gasto real | Parcial: `track.ts` (UTM, CAPI), `cron/budget-controller.ts` | Não |
| 10 | **Escriturário** | (não há) | Registro de cada venda para nota, conciliação mensal com o Mercado Pago, relatório para o contador | Não | Não |
| 11 | **Gerente de ronda** | Assistente Pessoal | Resumo 07:30 e 20:00 no seu WhatsApp, fila Para Aprovar, saúde dos setores | Parcial: `cron/health-monitor.ts`, `notify.ts` | Sim, rápido (só redação) |
| 12 | **Guardião** | Sentinel | Valida toda saída antes do envio; registra tokens, tempo e reprovação | **Sim**: `worker/src/guardiao/` (ampliar) | Não |

Fora do worker, em sessões do Claude Code com aval: **Editor** (Forge: compor e narrar) e **Vitrinista** (skill `pagina-de-obra`). Eles mexem em texto e site, portanto sempre nível 3.

## 4. Matriz de alçada da editora

| Nível | Executa como | Ações |
|---|---|---|
| **1 — Sozinho, registra** | `auto_approved` | Responder dúvida com dado do banco; enviar amostra grátis e link de checkout; reenviar acesso a quem comprou; lembrete de carrinho/Pix na janela; e-mail por etapa de leitura; marcar conciliação batida; pausar anúncio com ROAS < 0,6 depois de gastar 2× o ticket médio |
| **2 — Um toque** | `pending` | Publicar o lote semanal de posts; publicar depoimento; cupom de 5% a 15%; reembolso **dentro dos 7 dias** do direito de arrependimento (CDC, art. 49: é direito do leitor, o toque é só para conferir que é o comprador certo); divergência de caixa; aumentar orçamento de anúncio até 20% |
| **3 — Dupla confirmação** | bloqueado até 2 aprovações (você + código no celular) | Mudar preço ou texto de obra; publicar página nova; reembolso fora dos 7 dias; cupom acima de 15%; qualquer gasto novo com anúncio; emitir nota; resposta a reclamação pública ou a Procon/Reclame Aqui; qualquer deploy em produção |

**O que a IA nunca afirma** (o `validarSaida()` barra): preço que não está em `catalogo`; prêmio, sorteio ou ganho em dinheiro; prazo de lançamento de obra que não existe; bônus, série ou assinatura que não está à venda; dado pessoal de outro leitor; nome civil do autor (o autor é Said Anes); termos da lista `TERMOS_VETADOS`.

## 5. Inibições cruzadas (código, não IA)

1. **Reclamação aberta** → para Recuperação, Acompanhante e pedido de depoimento para esse leitor até fechar.
2. **Reembolso feito** → retira o livro da biblioteca, para os e-mails daquela obra e avisa o Escriturário (estorno na nota).
3. **Arquivo com defeito** (Bibliotecário) → tira a obra do checkout (P3 vermelho) e manda nível 3 para você antes de vender a próxima.
4. **Pediu para não receber** → nenhum agente manda mensagem ativa; só responde se a pessoa escrever.
5. **Mais de 3 mensagens ativas na semana** para a mesma pessoa → o resto espera a semana seguinte.
6. **Obra fora da vitrine** (`catalogo.ativo=false`) → Recepção não oferece; Divulgador não posta.

## 6. Estrutura no repositório

Tudo na casa que já existe: um repositório, um banco, um servidor.

```
3trevo/
├── CLAUDE.md                         # já existe: regras de trabalho
├── docs/producao/empresa-ia-editora.md   # este documento (a "constituição")
├── worker/src/
│   ├── agentes/
│   │   ├── ronda.ts                  # 00 orquestrador: lê eventos, aplica inibições
│   │   ├── inibicoes.ts              # seção 5 em código
│   │   ├── alcada.ts                 # seção 4 em código: classifica e grava na fila
│   │   ├── validar-saida.ts          # 12 Guardião: barra o que a IA não pode dizer
│   │   ├── ia.ts                     # chamada única à API do Claude, com registro de tokens
│   │   ├── recepcao.ts               # 01
│   │   ├── atendente.ts              # 06
│   │   ├── acompanhante.ts           # 07
│   │   ├── divulgador-pauta.ts       # 08
│   │   ├── caixa.ts                  # 03 conciliação diária
│   │   ├── escriturario.ts           # 10
│   │   ├── gerente-ronda.ts          # 11 resumo 07:30 / 20:00
│   │   └── mandatos/*.md             # o texto que cada agente de IA recebe
│   ├── routes/
│   │   ├── whatsapp-webhook.ts       # entrada de mensagens (Cloud API oficial)
│   │   └── admin-aprovacoes.ts       # Para Aprovar: listar, aprovar, recusar, desfazer
│   └── cron/                         # já existe: health, e-mail, carrinho, orçamento
├── worker/tests/agentes-*.test.ts    # um teste por regra de alçada e inibição
├── supabase/empresa-ia.sql           # migração aditiva da seção 7
└── admin.html                        # nova aba "Para Aprovar" (no celular)
```

## 7. Banco: migração aditiva

Nada existente é alterado. Todas as tabelas novas ficam com RLS ligada e **sem política** para `anon` e `authenticated`: só o worker, com a chave de serviço, lê e escreve.

```sql
create table if not exists public.agent_events (
  id uuid primary key default gen_random_uuid(),
  origem text not null,                      -- 'recepcao', 'mp-webhook', 'dono', ...
  destino text,                              -- null = a Ronda decide
  tipo text not null,                        -- 'compra.paga', 'leitura.parada_3dias', ...
  cliente_id uuid,                           -- profiles.id quando houver
  obra_slug text,
  payload jsonb not null default '{}',
  chave_idem text unique,                    -- evita processar o mesmo fato duas vezes
  status text not null default 'pendente'
    check (status in ('pendente','processando','feito','falhou','inibido')),
  tentativas int not null default 0,
  erro text,
  criado_em timestamptz not null default now(),
  feito_em timestamptz
);
create index if not exists agent_events_pendentes on public.agent_events (criado_em) where status = 'pendente';

create table if not exists public.approval_queue (
  id uuid primary key default gen_random_uuid(),
  agente text not null,
  acao text not null,                        -- 'publicar_lote', 'reembolso', 'cupom', ...
  nivel int not null check (nivel in (1,2,3)),
  resumo text not null check (char_length(resumo) <= 90),
  antes jsonb, depois jsonb not null,        -- para desfazer em um toque
  status text not null default 'pendente'
    check (status in ('auto','pendente','aprovado','recusado','expirado','desfeito')),
  aprovacoes int not null default 0,         -- nível 3 exige 2
  decidido_por text, decidido_em timestamptz,
  expira_em timestamptz not null default now() + interval '72 hours',
  criado_em timestamptz not null default now()
);

create table if not exists public.agent_audit_logs (
  id bigint generated always as identity primary key,
  agente text not null,
  evento_id uuid,
  tokens_entrada int, tokens_saida int, latencia_ms int,
  guardiao_ok boolean not null,
  motivo_bloqueio text,
  criado_em timestamptz not null default now()
);

alter table public.agent_events     enable row level security;
alter table public.approval_queue   enable row level security;
alter table public.agent_audit_logs enable row level security;
revoke all on public.agent_events, public.approval_queue, public.agent_audit_logs from anon, authenticated;
```

A view `v_caixa` (vendas pagas por dia, por origem e por obra, sobre `payments` e `purchases`) e a view `gestor_pulso` (etapa 17) entram na mesma migração, depois de conferir as colunas reais das duas tabelas no banco.

## 8. Centro administrativo seguro ("Para Aprovar")

1. **Entrada:** o link do resumo abre `admin.html#aprovar`. Sem sessão, pede senha (já existe) **e** código de 6 dígitos (TOTP, novo). O link não carrega token: se vazar, não aprova nada.
2. **Cartão:** resumo de 90 caracteres, agente, nível, "antes → depois" em linguagem simples (não JSON cru), botões Aprovar / Recusar.
3. **Nível 3:** depois do Aprovar, pede o código de novo. Duas decisões ficam registradas.
4. **Execução:** aprovar grava evento `aprovado.<acao>` no barramento; a Ronda executa e marca o cartão como feito. Se falhar, o cartão volta com o erro.
5. **Desfazer:** cada ação executada fica 7 dias com o botão Desfazer (usa `antes`).
6. **Expiração:** pendente há 72 h expira e aparece no resumo como "venceu sem decisão". Nada é executado por silêncio.
7. **Registro:** toda decisão grava quem, quando, IP e versão do cartão. Não se apaga.

## 9. Rotinas (horário de Brasília; o cron do Cloudflare usa UTC)

| Brasília | UTC (cron) | Rotina |
|---|---|---|
| a cada 5 min | `*/5 * * * *` | Ronda: processa eventos pendentes (sem evento, não chama IA) |
| de hora em hora | `0 * * * *` | Já existe: saúde, e-mail, orçamento, carrinho |
| 07:30 | `30 10 * * *` | Gerente de ronda: resumo da manhã |
| 08:00 | `0 11 * * *` | Caixa: conciliação das últimas 24 h |
| segunda 09:00 | `0 12 * * 1` | Divulgador-pauta: lote da semana para aprovação |
| 20:00 | `0 23 * * *` | Gerente de ronda: resumo da noite |
| dia 1, 09:00 | `0 12 1 * *` | Escriturário: fechamento do mês para o contador |

Mensagens que chegam pelo WhatsApp não esperam cron: o webhook grava o evento e a Ronda o processa na hora.

## 10. Como você recebe a editora todo dia

Exemplo de formato (os números são ilustrativos):

```
TRÊS TREVO · 07:30 · 19/11
ANDOU   3 vendas (2 Instagram, 1 direto) · R$ 89,70 · caixa 100% conferido
        11 dúvidas respondidas · 2 leitores terminaram o Livre das Dívidas
TRAVOU  1 leitor sem abrir o livro há 3 dias (lembrete enviado)
        Anúncio "Carrossel 2" pausado: ROAS 0,4 (nível 1)
DECIDA  2 itens → 3trevo.com.br/admin.html#aprovar
        · Publicar lote da semana 48 (5 posts)
        · Reembolso pedido #1042, dentro dos 7 dias (R$ 29,90)
SAÚDE   7 setores: 6 verdes, 1 amarelo (Fiscal: 3 vendas sem nota)
```

Seu papel fica reduzido a: aprovar o que está no "DECIDA", aprovar texto e números de cada obra (P1), publicar nas redes (até a conta permitir agendamento oficial) e falar com o contador.

## 11. Ordem de construção (etapas 21 a 26 do plano)

Ordem pensada para gerar venda antes de gerar painel: a aquisição vem antes do centro administrativo completo.

| Etapa | Entrega que você usa no celular | Construção | Pronto quando | Depende de você |
|---|---|---|---|---|
| **21 — Destravar** | Livre das Dívidas vendendo: PRs do forge, 2 secrets, compra de teste (P4) | 2–3 dias | Você compra no celular, lê, recebe e-mail, o Nema aparece | aval + 2 secrets (~1 h) |
| **22 — Barramento + Para Aprovar** | Migração da seção 7, Ronda, alçada, inibições, aba Para Aprovar com 2FA, resumo 07:30/20:00 | 2 semanas | Um evento de teste atravessa: fila → seu toque → execução → desfazer; resumo chega no WhatsApp com números conferidos à mão uma vez | limites da matriz (seção 4) |
| **23 — Aquisição** | UTM em todo link, origem medida, lote semanal pronto para aprovar | 1,5 semana | Visitas de campanha com origem identificada no resumo | publicar nas redes |
| **24 — Recepção e Atendente** | WhatsApp da editora respondendo com catálogo do banco e Guardião ligado | 1,5 semana | 30 perguntas de teste: 0 preço inventado, 0 promessa vetada | número da editora na WhatsApp Cloud API (prazo da Meta) |
| **25 — Leitura e Acompanhante** | Progresso entre aparelhos, e-mails por etapa de leitura, depoimento | 2 semanas | Troca de aparelho volta ao mesmo ponto; cada e-mail testado com envio real | — |
| **26 — Escriturário** | Registro por venda + conciliação mensal | 1 semana | Vendas sem nota = 0 | resposta do contador |

**Total:** 9 a 10 semanas de construção. Em calendário, cerca de 3 meses se cada aval sair em até 2 dias. As etapas 15 a 20 do plano são absorvidas aqui (15 e 19 → 25; 16 → 23; 17 → 22; 20 → 26). A 18 (vitrine dos demais títulos) segue em paralelo, um título por vez, quando você aprovar os números de cada um.

## 12. O que não verifiquei

- Custo mensal da API do Claude e das conversas da WhatsApp Cloud API no volume da editora: entra no laudo da etapa 22, medido pelos `agent_audit_logs` da primeira semana.
- Se o número de WhatsApp em `WHATSAPP_PHONE_ID` já é o número comercial da editora ou um número de alerta.
- As colunas exatas de `payments` e `purchases` para as views (conferir no banco antes da migração).
- Se a Meta permite publicar e agendar posts do Instagram da editora pela API (depende do tipo de conta).
- O regime fiscal da editora e a obrigação de nota por venda de e-book: pergunta para o contador.
