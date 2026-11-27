import { describe, it, expect } from 'vitest';
import { valorDivergente } from '../src/routes/checkout';

// Faixa legítima: de 50% do preço (teto de desconto do Nema) até o preço cheio.
describe('valorDivergente', () => {
  const preco = 19.9;

  it('aceita o preço cheio e valores dentro da faixa', () => {
    expect(valorDivergente(19.9, preco)).toBe(false);
    expect(valorDivergente(15, preco)).toBe(false);
  });

  it('aceita o desconto máximo do Nema (metade do preço)', () => {
    expect(valorDivergente(9.95, preco)).toBe(false);
  });

  it('sinaliza valor abaixo da metade do preço', () => {
    expect(valorDivergente(9.5, preco)).toBe(true);
    expect(valorDivergente(0, preco)).toBe(true);
    expect(valorDivergente(0.01, preco)).toBe(true);
  });

  it('sinaliza valor acima do preço cheio', () => {
    expect(valorDivergente(29.9, preco)).toBe(true);
  });

  it('tolera centavos de arredondamento', () => {
    expect(valorDivergente(19.91, preco)).toBe(false);
    expect(valorDivergente(9.94, preco)).toBe(false);
  });

  it('não opina sem preço de referência válido (não gera alerta falso)', () => {
    expect(valorDivergente(10, 0)).toBe(false);
    expect(valorDivergente(10, NaN)).toBe(false);
    expect(valorDivergente(NaN, preco)).toBe(false);
  });
});
