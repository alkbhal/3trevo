# Brief Frontend — Editora Três Trevo
**Para:** designer responsável pela construção do frontend  
**Versão:** 1.0 — 12 jun 2026  
**Decisor:** Dias (autor público: Said Anes)  
**Stack:** HTML estático no GitHub Pages → Cloudflare Worker (API) → Supabase (banco)

---

## 1. REGRAS INEGOCIÁVEIS

Leia antes de qualquer coisa. Qualquer peça entregue que viole estes itens será devolvida.

| Regra | Detalhe |
|---|---|
| **Sem emojis no conteúdo do site** | Zero emojis em textos, botões, títulos, descrições. O `✦` decorativo na nav e em poucos elementos estruturais é exceção consciente — não multiplicar. |
| **Nav verde-escuro sempre** | `#0f2d1a` no topo. Em nenhuma página a nav muda de cor base. |
| **Said Anes** é o único nome público de autor | Nunca citar "Dias" ou qualquer outro nome em páginas públicas. |
| **"Cota" nunca é monetária** | Nunca escrever "ganhou", "comprou cotas", "pagou por cotas". Cota é conquistada por produção. |
| **Construção em produção** | O site está no ar em `3trevo.com.br`. Qualquer mudança vai para o branch `main` e fica live. Zero downtime. |
| **HTML estático** | Não migrar para React, Next.js, ou qualquer framework. Quebra a gratuidade e adiciona manutenção que Dias não opera sozinho. |
| **Mobile-first** | Breakpoint principal: 768px. Layouts devem funcionar em 375px primeiro. |
| **WCAG AA** | Contraste mínimo 4.5:1 para texto normal, 3:1 para texto grande. Todos os interativos com estado `:focus-visible`. |
| **Sem Make.com no caminho crítico** | Emails e validações passam pelo Worker. Make é backup. |

---

## 2. SISTEMA DE DESIGN (o que já existe — não reinventar)

### 2.1 Tokens CSS (definidos em `index.html` — replicar em todas as páginas)

```css
:root {
  /* Fundos */
  --creme:      #f4efe5;   /* fundo principal (páginas light) */
  --creme2:     #ece6d6;   /* fundo secundário / seções alternadas */
  --creme3:     #e4dcc8;   /* hover / bordas suaves */
  --card:       #ffffff;   /* cards em páginas light */
  --footer:     #06091a;   /* fundo do footer */

  /* Verde */
  --verde-nav:  #0f2d1a;   /* nav — IMUTÁVEL */
  --verde:      #1a4a2e;   /* verde principal */
  --verde2:     #256640;   /* hover verde */

  /* Dourado */
  --ouro:       #c8a84b;   /* dourado principal (destaques, links hover) */
  --ouro-texto: #7a5c1e;   /* dourado para texto sobre fundo claro */
  --ouro2:      #8a6c2e;   /* variação */

  /* Noir */
  --noir:       #0a0e27;   /* azul-noturno para elementos de contraste */

  /* Tinta (texto) */
  --tinta:      #1a1a16;   /* texto principal */
  --tinta2:     #3d3c35;   /* texto secundário */
  --tinta3:     #6b6860;   /* texto terciário / labels */
  --tinta4:     #9a9790;   /* placeholders / texto muito suave */

  /* Bordas */
  --borda:      rgba(26,74,46,.12);
  --borda-ouro: rgba(200,168,75,.25);
}
```

**Páginas dark** (participação, área cliente, escritor) usam tema próprio:
```css
/* Tema dark — páginas autenticadas */
--bg:   #111a13;    /* fundo */
--bg2:  #162019;    /* alternado */
--card: #1c2a1e;    /* cards */
/* borda e ouro são os mesmos tokens globais */
```

### 2.2 Tipografia

| Papel | Fonte | Tamanho | Uso |
|---|---|---|---|
| Títulos / nome da marca | Lora (serif) | 20–52px | `<h1>`, `<h2>`, títulos de seção, nome da marca na nav |
| Interface / corpo | Poppins (sans-serif) | 400/500/600 | Todo o resto |
| Labels / categorias | Poppins uppercase | 10–12px, letter-spacing 2–4px | Seções, breadcrumbs, etiquetas |

**Import das fontes** (já presente, replicar em novas páginas):
```html
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;1,400;1,600&family=Poppins:wght@300;400;500;600&display=swap" rel="stylesheet">
```

### 2.3 Padrões visuais já estabelecidos

- **Seção label:** `font-size:10px; letter-spacing:4px; text-transform:uppercase; color:var(--ouro)` — precede todo `<h2>`
- **Linha dourada no topo do card:** `::before { height:2px; background:linear-gradient(90deg,var(--ouro),transparent) }` — padrão de card premium
- **Grid de depoimentos:** 3 colunas com `gap:1px; background:var(--borda-ouro)` — cria efeito de borda dourada entre cards
- **Textura de ruído** no `body::before` — overlay de `opacity:.45` com SVG fractalNoise. Manter em todas as páginas.
- **Scrollbar customizada:** track `--creme`, thumb `--ouro-texto`, width 4px
- **Reveal animation:** classe `.reveal` com `IntersectionObserver` — elementos entram suavemente ao rolar

### 2.4 Componentes reutilizáveis existentes

- **Nav** (linha 508 de `index.html`) — verde-escuro, logo Lora, links uppercase, botão CTA dourado, hamburger mobile
- **Footer** (linha 443) — grid 3 colunas, fundo `--footer`, links em dourado
- **`.sec-label` + `<h2>`** — padrão de abertura de seção
- **`.ebook-card`** — card de produto com gradiente, preço, cotas, botão
- **`.nav-cta`** — botão primário dourado sobre verde (usado no nav e em CTAs principais)
- **Botão secundário** — `border:1px solid var(--borda-ouro); color:var(--tinta); background:transparent`

---

## 3. ARQUITETURA DE PÁGINAS — ESTADO ATUAL

### 3.1 Páginas existentes e seu estado

| Arquivo | Estado | O que existe |
|---|---|---|
| `index.html` | Funcional, algumas pendências | Hero, catálogo, depoimentos hardcoded, FAQ, sobre, footer. **Ver itens 4.1** |
| `catalogo.html` | Funcional | Grid completo do catálogo com filtros |
| `checkout.html` | Funcional | Redirect para Rifei + dados do pedido |
| `area-cliente.html` | Parcialmente funcional | Área logada com biblioteca e downloads. **Ver 4.2** |
| `participacao-cultural.html` | Incompleto / incorreto | Form de depoimento existe mas chama endpoint errado. **Reconstruir — ver 4.3** |
| `premiacoes.html` | Funcional | Grid de sorteios com filtro, paginação, modal |
| `escritor.html` | Funcional parcial | Cadastro de escritor + envio de obra. Verificar campos mínimos com Dias |
| `admin.html` | Funcional (para Dias) | CRUD catálogo, prêmios, fila de moderação, métricas |
| `regras-programa-cultural.html` | Funcional | Regras do programa |
| `termos-programa-cultural.html` | Funcional | Termos |
| `atico.html` | Funcional | Chat com o Ático (IA) |
| `auditoria-sorteio.html` | Funcional | Resultados auditáveis dos sorteios |
| `biblioteca.html` | Funcional | Biblioteca de ebooks |
| `ebook-*.html` | Funcional (4 páginas) | Páginas individuais de obra |

### 3.2 Páginas que NÃO existem e precisam ser criadas

| Arquivo | Fase | Prioridade |
|---|---|---|
| `minha-conta.html` | 4 | Alta — após Fase 3 |
| Reader inline (ou modal) | 3 | Alta |
| Página de confirmação pós-compra | 0/1 | Média — hoje o usuário fica no Rifei |

---

## 4. O QUE FALTA FAZER — PÁGINA POR PÁGINA

### 4.1 `index.html` — 3 ajustes necessários

#### A) Seção de depoimentos: trocar hardcode por API real

**Situação:** os 3 depoimentos na seção `#depoimentos` (linha 870) são hardcoded (texto fixo, nomes fictícios). O Worker já tem o endpoint `/api/public/depoimentos` que retorna depoimentos com `estado='aprovado'` do banco.

**O que fazer:**
1. Remover os 3 `.dep-card` hardcoded do HTML
2. Adicionar script que busca `https://tres-trevo-api.al-kbhal.workers.dev/api/public/depoimentos`
3. Renderizar os cards dinamicamente com os campos: `texto`, `nome_autor`, `ebook_slug` (ou nome do ebook)
4. Se não houver depoimentos aprovados, esconder a seção inteira (não exibir vazia)
5. Máximo 3 depoimentos na home (os 3 mais recentes aprovados)

**Estrutura esperada de cada card:**
```html
<div class="dep-card reveal">
  <div class="dep-aspas" aria-hidden="true">"</div>
  <p class="dep-texto">[depoimento.texto]</p>
  <div class="dep-autor">[depoimento.nome_autor]</div>
  <div class="dep-livro">[nome do ebook]</div>
</div>
```

**Resposta da API** (`GET /api/public/depoimentos`):
```json
[
  {
    "id": "uuid",
    "texto": "texto do depoimento",
    "nome_autor": "Maria S.",
    "ebook_slug": "guia-antifalencia",
    "estado": "aprovado",
    "criado_em": "2026-06-10T..."
  }
]
```

#### B) Texto de "como funciona" — atualizar regra

**Situação:** na linha 743 diz "mínimo 20 palavras". A spec define mínimo 40 **caracteres** (não palavras) e exige **2 dimensões** (experiência no site + opinião sobre o produto).

**Corrigir para:**
> "Acesse seu link de participação e escreva um depoimento genuíno sobre o que você leu — cobrindo sua experiência no site e sua opinião sobre o conteúdo. Suas cotas são validadas automaticamente."

#### C) Botão "Programa Cultural" no nav

**Situação:** o nav não tem link para o programa cultural / participação.

**Adicionar nos links da nav:** `Programa Cultural → /regras-programa-cultural.html`

---

### 4.2 `area-cliente.html` — integrar depoimento

**Situação:** a área do cliente mostra biblioteca e downloads. Não tem o botão/link de "participar do programa cultural" vinculado ao pedido.

**O que adicionar:**
- Para cada ebook comprado, exibir o status do depoimento:
  - Se não enviou: botão "Participar do Programa Cultural" → `/participacao-cultural.html?pedido_id=XXX&slug=YYY`
  - Se depoimento em `revisao_manual`: badge "Em revisão — resposta em 48h"
  - Se `aprovado`: badge "Participando — [N] cotas ativas"
  - Se `reprovado_*`: badge "Depoimento recusado" + link para reenviar

**API para verificar estado:**
```
GET https://tres-trevo-api.al-kbhal.workers.dev/api/depoimento/status?pedido_id=XXX
Headers: X-Session-Token: [token da sessão]
```
_(Endpoint a implementar no Worker — ver seção 7)_

---

### 4.3 `participacao-cultural.html` — RECONSTRUIR COMPLETO

Esta é a página mais crítica e está **funcionalmente quebrada**. Precisa ser reconstruída do zero.

#### Problemas atuais:
1. Chama `supabase.co/functions/v1/validate-depoimento` — endpoint obsoleto
2. Não tem os 2 checkboxes de dimensão obrigatória
3. Não tem o questionário voluntário (multiplicador)
4. Não mostra cotas atuais nem barra de progresso da meta

#### Nova arquitetura da página:

**URL de acesso:** `/participacao-cultural.html?pedido_id=UUID&slug=ebook-slug`  
*(o link é enviado por email após a compra)*

**Fluxo em 4 etapas** (manter o stepper existente, mas com lógica nova):

```
Etapa 1: Verificar pedido
  → Worker valida se pedido_id é válido e se o prazo (D+7) ainda está aberto
  → Se inválido: mostrar mensagem de erro "Link de participação inválido"
  → Se vencido: mostrar contador "Prazo encerrado" com data de encerramento

Etapa 2: Escrever depoimento (BARREIRA DE ENTRADA)
  → Campo de texto com mínimo 40 caracteres
  → DOIS CHECKBOXES OBRIGATÓRIOS antes de enviar:
      ☐ "Meu depoimento aborda minha experiência no site"
      ☐ "Meu depoimento inclui minha opinião sobre o conteúdo do ebook"
  → Ambos precisam estar marcados para habilitar o botão de envio
  → Enviar para: POST /api/participacao/depoimento (Worker)
  → Estados possíveis após envio:
      - aprovado → mostrar confirmação + cotas creditadas → ir para Etapa 4
      - revisao_manual → mostrar "Em revisão — 48h" (NÃO ir para questionário ainda)
      - reprovado_calao → "Linguagem inadequada. Reescreva."
      - reprovado_conteudo → "Depoimento não demonstrou relação com o conteúdo. Reescreva."

Etapa 3: Questionário voluntário (MULTIPLICADOR — só após aprovação)
  → Exibir APENAS se depoimento = aprovado
  → Caráter voluntário explícito: "Esta etapa é opcional e aumenta suas chances"
  → Consentimento LGPD obrigatório ANTES de mostrar as perguntas:
      ☐ "Concordo que minhas respostas sejam usadas, de forma anônima, para pesquisa de mercado pela Editora Três Trevo, conforme a LGPD."
  → Se consentimento marcado: mostrar questionário
  → Se não marcado: mostrar botão "Pular esta etapa" → ir direto para Etapa 4

Etapa 4: Confirmação final
  → Mostrar: número de cotas ativas, nome do ebook, próxima data de apuração
  → Link para ver sorteios: /premiacoes.html
```

#### Questionário voluntário — estrutura (a definir com Dias, mas preparar o campo):

```
Pergunta 1: "Qual categoria de prêmio você gostaria de ver nas próximas rodadas?"
  Opções: [a definir com Dias — máximo 4 opções]

Pergunta 2: "Como você ficou sabendo da Editora Três Trevo?"
  Opções: Indicação de amigo / Redes sociais / Busca no Google / Outro

Pergunta 3: "Com que frequência você compra ebooks?"
  Opções: Esta foi minha primeira vez / Às vezes / Frequentemente / Sempre

Pergunta 4: "O que mais te motivou a comprar este ebook?"
  Opções: O tema / O programa cultural / O preço / A recomendação
```

*(Perguntas e opções finais: aprovação obrigatória de Dias antes do deploy)*

#### API a chamar (Worker):

```
POST /api/participacao/depoimento
Body: {
  pedido_id: "uuid",
  ebook_slug: "slug",
  texto: "texto do depoimento",
  cobre_experiencia: true,
  cobre_opiniao: true
}
Resposta: { estado: "aprovado" | "revisao_manual" | "reprovado_calao" | "reprovado_conteudo", cotas: N }

POST /api/participacao/questionario
Body: {
  pedido_id: "uuid",
  categoria_premio: "categoria escolhida",
  respostas: { p1: "resposta", p2: "resposta", ... },
  consentimento_lgpd: true
}
Resposta: { ok: true, multiplicador: 1.5 | 2.0 | 3.0, cotas_novas: N }
```

*(Estes endpoints precisam ser implementados no Worker — ver seção 7)*

#### Design visual:
- Manter o tema dark (`--bg: #111a13`) já existente na página
- Manter a estrutura de stepper (4 etapas) já construída
- Adicionar visualização de cotas no estado final:
  ```
  ┌─────────────────────────────┐
  │  SUAS COTAS ATIVAS          │
  │  ─────────────────          │
  │       [N]                   │  ← número grande em Lora
  │  cotas no Programa Cultural │
  │                             │
  │  Próxima apuração: [data]   │
  └─────────────────────────────┘
  ```
- Barra de progresso da meta (horizontal, dourada):
  ```
  Meta: R$ 500 em prêmios
  ████████░░░░░░░  62% arrecadado
  ```
  *(valor da meta e % a buscar na API: GET /api/public/meta)*

---

### 4.4 `escritor.html` — verificar e completar

**Situação:** página existe (420 linhas). Precisa verificar se os campos mínimos estão corretos e se está gravando em `manuscritos` via Worker.

**Campos obrigatórios segundo spec (primeiro filtro, organiza o envio):**
- Nome completo
- Email
- Telefone (opcional)
- Título da obra
- Gênero literário (dropdown)
- Sinopse (mínimo 100 caracteres)
- Formato do arquivo (PDF ou EPUB)
- Upload do arquivo (ou link para download privado)
- Declaração de autoria (checkbox obrigatório)

**API a chamar:**
```
POST /api/escritor/submeter
Headers: nenhum (público)
Body: multipart/form-data com os campos acima
Resposta: { ok: true, manuscrito_id: "uuid" }
```
*(Endpoint a implementar no Worker — ver seção 7)*

---

### 4.5 `minha-conta.html` — CRIAR (Fase 4)

Página da área logada com visão completa da conta. Só construir após Fase 3 (NF-e pronta).

**Seções:**
1. **Biblioteca** — ebooks comprados com botão de download (link de download seguro via Worker)
2. **Nota Fiscal** — para cada compra: status da NF (pendente/emitida) + botão download PDF
3. **Programa Cultural** — status de participação por ebook (cotas, estado do depoimento)
4. **Dados pessoais** — editar nome, telefone (email é chave, não editável)

---

### 4.6 Reader (Fase 3)

Leitura imersiva do ebook dentro do site. Não é prioridade agora.

**Requisitos futuros:**
- Acesso via `/reader.html?pedido_id=UUID&slug=slug`
- Autenticação via pedido_id (não exige login)
- Progresso salvo (localStorage + sync com Supabase se possível)
- Sumário lateral collapsible
- Ajuste de tamanho de fonte (3 opções: pequena / média / grande)
- Fundo branco ou sépia (2 opções)
- Mobile: modo retrato com swipe entre capítulos

---

## 5. FLUXOS DE USUÁRIO COMPLETOS

### 5.1 Fluxo de compra → participação (fluxo principal)

```
1. Usuário acessa index.html → vê catálogo → clica "Adquirir ebook"
2. → checkout.html → redirect para Rifei (rifei.com/c/editora-tres-trevo/...)
3. Rifei processa pagamento → dispara webhook para Worker
4. Worker: grava pedido + cliente no Supabase → envia email com:
     • Link de download: https://xfkepekffdyrtcgagwqo.supabase.co/functions/v1/get-download?pedido_id=UUID&slug=SLUG
     • Link de participação: https://3trevo.com.br/participacao-cultural.html?pedido_id=UUID&slug=SLUG
5. Usuário baixa ebook, lê
6. Após 7 dias: link de participação ativa
7. Usuário acessa /participacao-cultural.html?pedido_id=UUID&slug=SLUG
8. Preenche depoimento (2 dimensões) → Worker valida (camada 1 regex + camada 2 IA)
9. Se aprovado: cotas creditadas → mostra questionário voluntário
10. Se questionário respondido + consentimento: multiplicador aplicado → cotas aumentam
11. Usuário pode ver sorteios em /premiacoes.html
```

### 5.2 Fluxo admin — moderação de depoimentos

```
1. Dias acessa /admin.html → aba "Depoimentos"
2. Lista de depoimentos em estado "revisao_manual" (baixa confiança da IA)
3. Para cada um: ler texto → aprovar ou reprovar (com motivo)
4. Aprovação: credita cota base do cliente
5. Reprovação: envia email para cliente com motivo + link para reenviar
```

### 5.3 Fluxo escritor → publicação

```
1. Escritor acessa /escritor.html → preenche formulário + envia manuscrito
2. Worker grava em `manuscritos` com status "aguardando"
3. Dias vê na fila do admin (/admin.html → aba "Manuscritos")
4. Processo de edição acontece LOCAL (fora do site, na máquina de Dias)
5. Quando ebook está pronto: Dias cadastra em `products` via admin
6. Ebook aparece no catálogo automaticamente
```

---

## 6. APIS DISPONÍVEIS (Worker: tres-trevo-api.al-kbhal.workers.dev)

### 6.1 Endpoints públicos (sem autenticação)

| Método | URL | Uso |
|---|---|---|
| GET | `/api/public/depoimentos` | Lista depoimentos aprovados (max 20, ordenados por data) |
| GET | `/api/public/meta` | Meta financeira do ciclo atual (para barra de progresso) |

### 6.2 Endpoints autenticados por pedido (token no query string ou header)

| Método | URL | Uso |
|---|---|---|
| POST | `/api/participacao/depoimento` | Enviar depoimento (body: pedido_id, texto, flags) |
| POST | `/api/participacao/questionario` | Enviar questionário (body: pedido_id, respostas, consentimento) |
| GET | `/api/participacao/status?pedido_id=UUID` | Ver estado atual da participação |

### 6.3 Endpoints autenticados (X-Session-Token — área cliente)

| Método | URL | Uso |
|---|---|---|
| POST | `/api/auth/login` | Login com email → envia magic link |
| GET | `/api/cliente/pedidos` | Lista pedidos do cliente logado |
| GET | `/api/cliente/download?pedido_id=UUID` | URL de download do ebook |

### 6.4 Endpoints admin (X-Session-Token com role admin)

| Método | URL | Uso |
|---|---|---|
| GET | `/api/admin/depoimentos?estado=revisao_manual` | Fila de moderação |
| POST | `/api/admin/depoimentos/:id/aprovar` | Aprovar depoimento |
| POST | `/api/admin/depoimentos/:id/reprovar` | Reprovar com motivo |
| GET | `/api/admin/metricas` | Dashboard de métricas |

---

## 7. ENDPOINTS DO WORKER QUE PRECISAM SER IMPLEMENTADOS

Estes endpoints ainda não existem. O designer deve construir o frontend apontando para eles, mas deixar o tratamento de erro claro. O Worker vai implementá-los.

| Endpoint | Status | Prioridade |
|---|---|---|
| `POST /api/participacao/depoimento` | A implementar | Alta (bloqueia 4.3) |
| `POST /api/participacao/questionario` | A implementar | Alta (bloqueia 4.3) |
| `GET /api/participacao/status` | A implementar | Alta (bloqueia 4.2) |
| `POST /api/escritor/submeter` | A implementar | Média (bloqueia 4.4) |
| `GET /api/public/meta` | A implementar | Baixa |

---

## 8. BANCO DE DADOS — CONTEXTO PARA O DESIGNER

O banco (Supabase) tem as seguintes tabelas relevantes para o frontend:

| Tabela | Para o frontend |
|---|---|
| `products` | Catálogo de ebooks (slug, título, preço, cotas base) |
| `catalogo` | View do catálogo com campos de marketing |
| `pedidos` | Compras dos clientes (vincula cliente ↔ ebook) |
| `clientes` | Dados dos compradores |
| `depoimentos` | Depoimentos (estado: recebido/aprovado/etc.) |
| `draw_entries` | Cotas de participação (fonte da verdade) |
| `draw_audits` | Histórico de sorteios auditáveis |
| `manuscritos` | Obras submetidas por escritores |
| `premios` | Prêmios configurados pelo admin |
| `config` | Configurações do site (banner, hero, meta, FAQ) |

**Regra crítica:** O frontend **nunca** acessa o Supabase diretamente com a `service_role` key. Toda escrita e leitura sensível passa pelo Worker. A `anon_key` (pública, no HTML) só lê dados com RLS liberado publicamente.

---

## 9. ESTADO DO BANCO — MIGRATIONS PENDENTES

Antes de construir as páginas de participação, estas migrations precisam ser aplicadas no Supabase:

1. **`recriar_depoimentos`** — tabela com `estado` (máquina de estados) + campos de 2 dimensões
2. **`criar_respostas_pesquisa`** — questionário anônimo
3. **`ajustar_draw_entries`** — adicionar `depoimento_id` e `pesquisa_respondida`

*(Responsabilidade: Claude Code / Dias — não do designer. Documentado aqui para alinhar expectativas de quando as APIs estarão prontas.)*

---

## 10. PENDÊNCIAS EXTERNAS (fora do escopo do designer)

Estas dependências bloqueiam partes do sistema mas não bloqueiam a construção do frontend:

| Bloqueio | Status | O que bloqueia |
|---|---|---|
| **B1: Resend** | Desbloqueado (API Key configurada, domínio verificado) | Emails pós-compra |
| **B2: NF-e / Bling** | Bloqueado — precisa de .pfx do contador + conta Bling | `/minha-conta.html` (download de NF) |
| **B3: Conta PJ** | Bloqueado — Dias + contador | Split financeiro, Fase 3 |

---

## 11. CHECKLIST DE ENTREGA — POR PRIORIDADE

### Sprint 1 (Fase 1 — fundação)
- [ ] Ajustar seção `#depoimentos` no `index.html` para buscar da API (item 4.1-A)
- [ ] Corrigir texto "mínimo 20 palavras" no `index.html` (item 4.1-B)
- [ ] Adicionar link "Programa Cultural" no nav (item 4.1-C)
- [ ] Verificar responsividade mobile de todo `index.html` (375px, 768px)
- [ ] Verificar WCAG AA em todas as combinações de cor usadas

### Sprint 2 (Fase 2 — Programa Cultural)
- [ ] Reconstruir `participacao-cultural.html` completo (item 4.3)
  - [ ] Stepper funcional em 4 etapas
  - [ ] Formulário com 2 checkboxes de dimensão
  - [ ] Integração com `POST /api/participacao/depoimento`
  - [ ] Questionário com consentimento LGPD
  - [ ] Integração com `POST /api/participacao/questionario`
  - [ ] Tela de confirmação com cotas + barra de progresso
- [ ] Adicionar status de participação na `area-cliente.html` (item 4.2)
- [ ] Verificar/completar `escritor.html` (item 4.4)

### Sprint 3 (Fase 3 — Reader + Admin)
- [ ] Reader imersivo (item 4.6)
- [ ] Ajustar `admin.html` para fila de moderação de depoimentos

### Sprint 4 (Fase 4 — go-live)
- [ ] Criar `minha-conta.html` (item 4.5)
- [ ] Core Web Vitals: LCP <2.5s, CLS <0.1, FID <100ms
- [ ] Auditoria WCAG AA completa
- [ ] Teste em Safari iOS + Chrome Android

---

## 12. DÚVIDAS QUE PRECISAM DE RESPOSTA DE DIAS ANTES DO DEPLOY

Estas definições impactam o frontend e ainda não foram decididas:

1. **Mínimo de caracteres do depoimento:** spec diz 40. É suficiente para "frase com conteúdo"?
2. **Perguntas e opções do questionário:** quais são as 4 categorias de prêmio que o usuário pode eleger?
3. **Texto exato do consentimento LGPD** do questionário (finalidade explícita)
4. **Meta financeira do ciclo:** qual valor em R$ aparece na barra de progresso?
5. **Campos mínimos do manuscrito** no `escritor.html`: sinopse tem limite de caracteres?
6. **Prazo de participação:** spec diz D+7 (7 dias após compra). Confirmar se é D+7 ou D+30?

---

*Documento gerado com base na especificação executável v1.1 (8 jun 2026), no estado atual das páginas HTML do repositório, e nas conversas de construção do projeto. Qualquer dúvida técnica sobre o Worker ou banco de dados: consultar `docs/specs/3trevo-especificacao-executavel-v1.1.md` e `RELATORIO_ENTREGA.md`.*
