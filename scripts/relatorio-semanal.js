/**
 * relatorio-semanal.js — Growth Engine Fase 4
 * Gera relatório semanal de marketing no Obsidian vault
 *
 * Uso: node scripts/relatorio-semanal.js [WORKER_URL] [ADMIN_TOKEN]
 * Saída: SEGUNDO_CEREBRO/1 - Projetos/3trevo-marketing-YYYY-WW.md
 */

const fs = require('fs');
const path = require('path');

const VAULT = path.join(process.env.USERPROFILE || '', 'Documents', 'SEGUNDO_CEREBRO', '1 - Projetos');
const API = process.argv[2] || 'https://tres-trevo-api.al-kbhal.workers.dev';
const TOKEN = process.argv[3] || '';

async function main() {
  const now = new Date();
  const weekNum = getISOWeek(now);
  const year = now.getFullYear();
  const filename = `3trevo-marketing-${year}-W${String(weekNum).padStart(2, '0')}.md`;
  const filepath = path.join(VAULT, filename);

  let stats = null;
  if (TOKEN) {
    try {
      const r = await fetch(`${API}/api/admin/marketing/stats`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      stats = await r.json();
    } catch (e) {
      console.error('Erro ao buscar stats:', e.message);
    }
  }

  const md = generateReport(now, weekNum, year, stats);

  if (!fs.existsSync(VAULT)) {
    fs.mkdirSync(VAULT, { recursive: true });
  }
  fs.writeFileSync(filepath, md, 'utf8');
  console.log('Relatório gerado:', filepath);
}

function generateReport(now, week, year, stats) {
  const date = now.toISOString().split('T')[0];
  const s = stats || {};

  return `---
tags: [marketing, 3trevo, semanal]
date: ${date}
---

# Relatório Marketing — Semana ${week}/${year}
> Gerado em ${date}

## KPIs

| Métrica | Valor |
|---------|-------|
| Total de leads | ${s.total_leads ?? '—'} |
| Leads esta semana | ${s.leads_week ?? '—'} |
| Eventos rastreados | ${s.total_events ?? '—'} |
| E-mails pendentes | ${s.emails_pending ?? '—'} |

## Eventos por tipo

${formatEventBreakdown(s.event_breakdown)}

## Leads recentes

${formatLeadsTable(s.leads_recent)}

## Observações

- [ ] Verificar taxa de abertura dos e-mails
- [ ] Analisar páginas com maior scroll depth
- [ ] Avaliar CTR dos CTAs
- [ ] Comparar com semana anterior

## Ações para próxima semana

- [ ] _preencher manualmente_

---
*Gerado por scripts/relatorio-semanal.js — Growth Engine Fase 4*
`;
}

function formatEventBreakdown(eb) {
  if (!eb || !Object.keys(eb).length) return '_Sem dados ainda._\n';
  return Object.entries(eb)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `- **${k}**: ${v}`)
    .join('\n') + '\n';
}

function formatLeadsTable(leads) {
  if (!leads || !leads.length) return '_Sem leads ainda._\n';
  const rows = leads.slice(0, 10).map(l => {
    const dt = l.created_at ? l.created_at.split('T')[0] : '—';
    return `| ${l.nome || '—'} | ${l.email} | ${l.status} | ${l.score ?? 0} | ${dt} |`;
  });
  return `| Nome | E-mail | Status | Score | Data |\n|------|--------|--------|-------|------|\n${rows.join('\n')}\n`;
}

function getISOWeek(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

main().catch(e => { console.error(e); process.exit(1); });
