import { describe, it, expect } from 'vitest';
// @ts-ignore — módulo JS do site (sem tipos), servido em /js/sfdtt-motor.js
import * as M from '../../js/sfdtt-motor.js';

describe('fórmulas do livro (capítulo 3)', () => {
  it('cheque especial 8% a.m.: tabela do livro', () => {
    const t = M.tabelaJuros(1000, 0.08, [1, 2, 3, 6, 12]);
    expect(t.map((l: any) => l.divida)).toEqual([1080, 1166.4, 1259.71, 1586.87, 2518.17]);
    expect(t[0].jurosDoMes).toBe(80);
    expect(t[4].jurosDoMes).toBe(186.53);
    expect(M.taxaAnual(0.08)).toBeCloseTo(1.518, 3);
  });
  it('5% a.m. vira quase 80% a.a.; 15% a.m. ≈ 435% a.a.', () => {
    expect(M.taxaAnual(0.05)).toBeCloseTo(0.796, 3);
    expect(M.taxaAnual(0.15)).toBeCloseTo(4.35, 2);
  });
  it('agiota 20% a.m.', () => {
    expect(M.jurosCompostos(1000, 0.2, 6)).toBe(2985.98);
    expect(M.jurosCompostos(1000, 0.2, 12)).toBe(8916.1);
  });
  it('caso Carlos: Price e teto de 100%', () => {
    const p = M.parcelaPrice(977.5, 0.08, 12);
    expect(p).toBe(129.71);
    const juros = 127.5 + (p * 12 - 977.5);
    const teto = M.tetoCartao(850, juros);
    expect(teto.respeitado).toBe(true);
    expect(Math.round(juros * 100) / 100).toBe(706.52);
  });
  it('taxa escondida em 12 × R$ 268 sobre R$ 2.340 ≈ 5,3% a.m.', () => {
    const i = M.taxaImplicita(2340, 268, 12);
    expect(i).toBeGreaterThan(0.052);
    expect(i).toBeLessThan(0.054);
    expect(M.parcelaPrice(2340, i, 12)).toBeCloseTo(268, 1);
  });
  it('salário sequestrado: 700/2000 = 35% = 10,5 dias', () => {
    const s = M.sequestro(700, 2000);
    expect(s.pct).toBeCloseTo(0.35);
    expect(s.dias).toBe(10.5);
    expect(s.alerta).toBe(true);
  });
});

describe('capítulos 6 a 9', () => {
  it('parcela que cabe: 2000 − 1600 = 400, oferta ≈ 2/3', () => {
    expect(M.parcelaQueCabe(2000, 1600, 0)).toEqual({ teto: 400, oferta: 266.67 });
  });
  it('mínimo existencial: 1800 − 1350 = 450 < 600', () => {
    const m = M.minimoExistencial(1800, 1350);
    expect(m.sobra).toBe(450);
    expect(m.abaixo).toBe(true);
  });
  it('Joana na fase 1 da escada (~91%)', () => {
    const f = M.faseEscada(1495, 1649.42);
    expect(f.fase).toBe(1);
    expect(f.pct).toBeCloseTo(0.906, 3);
  });
  it('reserva: 3 meses (6 com renda incerta)', () => {
    expect(M.metaReserva(1495).final).toBe(4485);
    expect(M.metaReserva(1000, true).meses).toBe(6);
  });
});

describe('núcleo SFDTT', () => {
  const base = {
    rendaCerta: 2000, saldo: 300,
    essenciais: { moradia: 700, comida: 500, contas: 200, transporte: 150, remedios: 50 },
    outrosGastos: 100,
    dividas: [
      { id: 'a', nome: 'Cartão (parcelamento)', saldo: 2350, parcela: 250, juros: 8, atraso: true },
      { id: 'b', nome: 'Carnê da loja', saldo: 420, parcela: 0, juros: 5, atraso: false },
      { id: 'c', nome: 'Cheque especial', saldo: 324, parcela: 0, juros: 8, atraso: false },
    ],
  };
  it('estado: atraso => Sobrevivência ou pior', () => {
    const d = M.diagnostico(base);
    expect(['sobrevivencia', 'pre_colapso']).toContain(d.estado.id);
    expect(d.pontos.length).toBeLessThanOrEqual(3);
    expect(d.acao1).not.toBeNull();
  });
  it('IRF igual ao do SFDTT v8', () => {
    const irf = M.calcIRF({ comp: 0.5, inad: 0, saldo: 3000, gastosMes: 1000, entradas: 2000, parcelas: 200, mesesOk: 2 });
    expect(irf.breakdown).toEqual({ c1: 100, c2: 200, c3: 200, c4: 80, c5: 160 });
    expect(irf.score).toBe(740);
    expect(irf.label).toBe('Bom');
  });
  it('DDO', () => {
    expect(M.calcDDO(500, 1500)).toBe(10);
    expect(M.calcDDO(100, 0)).toBe(999);
  });
  it('ordem vem do R-DIVIDA-ORDEM do SFDTT; prioridade legal do livro na frente', () => {
    const d = M.diagnostico({
      ...base, rendaCerta: 6000,
      dividas: [
        { id: '1', nome: 'Rotativo', saldo: 900, juros: 15 },
        { id: '2', nome: 'Moto', saldo: 5000, juros: 2, garantia: true },
        { id: '3', nome: 'Pensão atrasada', saldo: 800, tipo: 'pensao' },
      ],
    });
    expect(d.ordem.bloqueada).toBe(false);
    expect(d.ordem.ordem.map((o: any) => o.id)).toEqual(['3', '2', '1']);
  });
  it('guarda do SFDTT: renda abaixo de 2 salários mínimos não recebe ordem de quitação', () => {
    const d = M.diagnostico(base);
    expect(d.ordem.bloqueada).toBe(true);
    expect(d.guarda).toBe('renda_subsistencia');
    expect(d.ordem.recursos.length).toBeGreaterThan(0);
    expect(d.acoes.some((a: any) => a.id === 'l35-renda_subsistencia')).toBe(true);
  });
  it('nunca inventa taxa: dívida sem juros não gera juros', () => {
    const d = M.diagnostico({ rendaCerta: 3000, essenciais: { moradia: 800 }, dividas: [{ id: 'z', nome: 'Sem taxa', saldo: 1000 }] });
    expect(d.ordem.jurosMes).toBe(0);
    expect(d.acoes.some((a: any) => a.id === 'registrato')).toBe(true);
  });
  it('renda incerta fica fora da base', () => {
    const r = M.resumo({ rendaCerta: 1000, rendaIncerta: 500, outrosGastos: 1200 });
    expect(r.sobra).toBe(-200);
    expect(r.sobraComIncerta).toBe(300);
  });
  it('guarda de insolvência grave (dívida > 2 × renda anual)', () => {
    const d = M.diagnostico({ rendaCerta: 2000, dividas: [{ id: 'g', nome: 'X', saldo: 60000, atraso: true }] });
    expect(d.guarda).toBe('insolvencia_grave');
    expect(d.estado.id).toBe('colapso');
  });
  it('reserva inicial antes da avalanche; depois estanca a dívida cara', () => {
    const r1 = M.resumo({ rendaCerta: 3000, saldo: 100, dividas: [{ id: 'c', nome: 'Rotativo', saldo: 900, juros: 15 }] });
    expect(M.regraReserva(r1).fase).toBe('inicial');
    const r2 = M.resumo({ rendaCerta: 3000, saldo: 800, dividas: [{ id: 'c', nome: 'Rotativo', saldo: 900, juros: 15 }] });
    expect(M.regraReserva(r2).fase).toBe('estancar');
  });
  it('investir ou quitar', () => {
    expect(M.investirOuQuitar({ juros: 8 }).acao).toBe('quitar');
    expect(M.investirOuQuitar({ juros: 0.5 }).acao).toBe('investir');
    expect(M.investirOuQuitar({}).acao).toBeNull();
  });
});
