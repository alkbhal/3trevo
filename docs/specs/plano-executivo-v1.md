# Plano Executivo Final — v1
**Três Trevo | Reestilização + Sorteio + Entrega**
**Data:** 8 de junho de 2026

> **Status deste documento:** rascunho de planejamento anterior à sessão de 2026-06-08.
> Itens substituídos por decisões da sessão estão marcados com ~~riscado~~.
>
> | Item | Status |
> |------|--------|
> | ~~Stack: Next.js~~ | **Substituído** — mantém HTML estático (spec 0.3, decisão 2026-06-08) |
> | ~~Multiplicador por follows de redes sociais~~ | **Substituído** — modelo novo: Depoimento + Questionário sem redes (spec v1.1 seção 2.2) |
> | Motor Dinâmico (fórmula Prêmio_dia) | **Pendente decisão** — mecânica aprovada; nomenclatura "sorteio" em revisão jurídica |
> | Roadmap 14 dias | **Referência** — alinhado com spec v1.1 fases 0–3 |

---

## I. Clarificação das Respostas

### 1. Motor B = Forge (confirmado)
Motor A: Editor Assistente Autônomo (conversas no Claude).
Motor B: Forge — escritor competente que recebe tema + contexto, entrega manuscrito em PDF com pesquisa real, emite ações de revisão (ainda incompleto), calcula custo de produção.

### 2. Forge — escopo atual
Entrega: PDF manuscrito com pesquisa real, cálculo de custo, permite baixar para envio ao Editor Assistente (edição + ilustração).

### 3. Biblioteca de Música
Status: FUNCIONAL. Hospedagem desconhecida (será auditada). Fluxo funciona.

### ~~4. Categorias — modelo antigo (substituído)~~
~~Multiplicador: 1–3× conforme follows (WhatsApp, Instagram, Facebook, TikTok, YouTube).~~
**→ Substituído por:** Depoimento (2 dimensões) + Questionário de Interesse anônimo. Ver PLANO-VALIDACAO-ITEM4-REFORMULADO.md.

### 5. Duração do ciclo
Campanha abre quando o admin dispara → encerra quando atinge a meta definida OU após X dias (whichever comes first).

### 6. Rodadas
R$ 10k → Rodada 1; R$ 20k → Rodada 2; R$ 30k → Rodada 3.

### 7. Distribuição 70/30
Baseado em análise de dados reais (volume, tração, confiança) e neuromarketing (urgência, escassez, ancoragem).

### 8. Mobile
Responsivo, sem versão dedicada.

---

## II. Decisões Pré-Tomadas

### A. Reestilização
Design Noir (#0a0e27) + Dourado funcional | Lora + Poppins | mobile-first.

### B. Motor Dinâmico *(nomenclatura em revisão jurídica)*
Hoje sem tração = premiação menor + comunicação de meta clara.
Com tração = premiação maior + urgência.

### C. Bugs Críticos
Fase 0: Gmail re-auth, HMAC webhook, testes e2e. Estimativa: 1–2 dias.

---

## III. Roadmap Paralelo (~14 dias MVP)

Fase 0 bloqueia. Fases 1–3 rodam em paralelo.

**Semana 1 (até 15/jun):** Bugs críticos + Landing + Catálogo em Noir.
Meta: site carrega, visual premium, checkout funciona.

**Semana 2 (15–22/jun):** Minha Participação + Motor dinâmico.
Meta: usuário vê jornada de cotas, pesquisa, habilitação.

**Semana 3 (22–30/jun):** Motor refinado + Dashboard + Admin de campanhas.
Meta: gestor monitora em tempo real; campanhas dinâmicas.

---

## IV. Motor Dinâmico — Mecânica

**Fórmula:** `Prêmio_dia = (Arrecadação_hoje / Arrecadação_meta_ciclo) × Pool × Fator_confiança`

**Implementação:**
- Tabela Supabase: `campaign_metrics` (daily snapshots)
- Função Worker: calcula valores diários e dispara a premiação
- Dashboard: exibe a fórmula aplicada em tempo real

*Nomenclatura pública ("sorteio" vs. alternativa) pendente revisão jurídica — não implementar textos de UI antes da decisão.*

---

## V. Segurança e Conformidade
HMAC, RLS, transparência SHA256, auditoria imutável, isenção fiscal de ebooks (CF/88 art. 150 VI d).
