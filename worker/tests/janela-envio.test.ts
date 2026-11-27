import { describe, it, expect } from 'vitest';
import { agendarRecovery1, agendarRecovery2, emSilencio } from '../src/cron/janela-envio';

// Horário de Brasília (UTC-3) → ms UTC
const brt = (iso: string) => Date.parse(iso + '-03:00');
const fmt = (ms: number) => new Date(ms - 3 * 3600000).toISOString().slice(0, 16);

describe('janela de envio da recuperação de carrinho', () => {
  it('silêncio entre 22h e 8h', () => {
    expect(emSilencio(brt('2026-11-04T21:59:00'))).toBe(false);
    expect(emSilencio(brt('2026-11-04T22:00:00'))).toBe(true);
    expect(emSilencio(brt('2026-11-05T07:59:00'))).toBe(true);
    expect(emSilencio(brt('2026-11-05T08:00:00'))).toBe(false);
  });

  it('carrinho às 21h33: 1º às 9h, 2º às 16h33 (antes do Pix vencer às 20h33)', () => {
    const ini = brt('2026-11-03T21:33:00');
    const r1 = agendarRecovery1(ini, brt('2026-11-03T23:00:00'));
    expect(fmt(r1)).toBe('2026-11-04T09:00');
    expect(fmt(agendarRecovery2(ini, r1))).toBe('2026-11-04T16:33');
  });

  it('carrinho às 10h: 1º às 11h, 2º puxado para 21h30 (alvo 5h cai no silêncio)', () => {
    const ini = brt('2026-11-04T10:00:00');
    const r1 = agendarRecovery1(ini, brt('2026-11-04T11:00:00'));
    expect(fmt(r1)).toBe('2026-11-04T11:00');
    expect(fmt(agendarRecovery2(ini, r1))).toBe('2026-11-04T21:30');
  });

  it('carrinho às 2h: 1º às 9h, 2º às 21h', () => {
    const ini = brt('2026-11-04T02:00:00');
    const r1 = agendarRecovery1(ini, brt('2026-11-04T03:00:00'));
    expect(fmt(r1)).toBe('2026-11-04T09:00');
    expect(fmt(agendarRecovery2(ini, r1))).toBe('2026-11-04T21:00');
  });

  it('carrinho às 20h30: 2º às 15h30 do dia seguinte', () => {
    const ini = brt('2026-11-04T20:30:00');
    const r1 = agendarRecovery1(ini, brt('2026-11-04T21:30:00'));
    expect(fmt(r1)).toBe('2026-11-04T21:30');
    expect(fmt(agendarRecovery2(ini, r1))).toBe('2026-11-05T15:30');
  });

  it('nunca agenda nada no silêncio e mantém 3h entre os dois', () => {
    for (let m = 0; m < 24 * 60; m += 7) {
      const ini = brt('2026-11-04T00:00:00') + m * 60000;
      const r1 = agendarRecovery1(ini, ini + 3600000);
      const r2 = agendarRecovery2(ini, r1);
      expect(emSilencio(r1)).toBe(false);
      expect(emSilencio(r2)).toBe(false);
      expect(r2 - r1).toBeGreaterThanOrEqual(3 * 3600000);
    }
  });
});
