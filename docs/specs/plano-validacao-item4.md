# Plano Executivo — Validação Final (Item 4 Reformulado)
**Três Trevo | Reestilização + Motor Dinâmico + Entrega**
**Data:** 8 de junho de 2026

> **Status deste documento:** atualização do plano-executivo-v1.md corrigindo o Item 4.
>
> | Item | Status |
> |------|--------|
> | ~~Decisão 1: Stack Next.js~~ | **Substituído** — mantém HTML estático (spec 0.3, decisão 2026-06-08) |
> | Item 4: Depoimento + Questionário sem redes | **Confirmado** — alinhado com spec v1.1 seção 2.2 |
> | Decisão 2: Design Noir + Dourado | **Confirmado** |
> | Decisão 3: Prioridade de fases | **Confirmado** |
> | Decisão 4: Motor Dinâmico | **Confirmado** — mecânica; nomenclatura pública em revisão jurídica |
> | Decisão 5: Transparência SHA256 | **Confirmado** |
> | Decisão 6: Fase 0 como bloqueador | **Confirmado** |

---

## I. Item 4 Reformulado — Dinâmica de Multiplicação de Cotas

**Novo modelo (substitui follows de redes sociais):**

| Ação | Cotas | Natureza |
|------|-------|----------|
| Depoimento (2 dimensões: experiência + opinião do produto) | Base — habilita participação | Prova social + barreira de entrada |
| Questionário de Interesse anônimo | Multiplicador até 3× | Dado estratégico voluntário |

- Sem follows de redes sociais — removido por não-verificabilidade e risco jurídico
- Máximo: 3× por compra
- Questionário nasce anônimo (sem vínculo persistido com a identidade)

---

## II. Decisões Confirmadas

**~~Decisão 1 (substituída): Stack — HTML estático (não Next.js)~~**
Cloudflare Worker + Supabase + GitHub Pages. Gratuito e suficientemente eficiente.

**Decisão 2:** Design — Noir (#0a0e27) + Dourado (#9D6B2D) | Lora + Poppins.

**Decisão 3:** Prioridade — 1º Landing/Catálogo/Checkout | 2º Minha Participação/Premiações | 3º Reader | 4º Admin.

**Decisão 4:** Motor Dinâmico — ajusta premiação em tempo real (arrecadação, confiança, urgência, elasticidade).
*Nomenclatura pública pendente revisão jurídica.*

**Decisão 5:** Transparência — Seed + SHA256 + auditoria imutável + grid público.

**Decisão 6:** Fase 0 (1–2 dias) = 404 fix + Gmail re-auth + HMAC + testes e2e. Bloqueia tudo.

---

## III. Roadmap Paralelo (~14 dias MVP)
Fase 0 bloqueia. Fases 1–3 rodam em paralelo após desbloqueio.
