import { describe, it, expect } from 'vitest';
import { cpfValido, cnpjValido, validarDadosNF, payerMP } from '../src/fiscal';

const endereco = {
  cep: '95660-000', logradouro: 'Rua Principal', numero: '100', complemento: '',
  bairro: 'Centro', cidade: 'Montauri', uf: 'rs', ibge: '4312476',
};

describe('cpfValido / cnpjValido', () => {
  it('aceita CPF com dígitos certos e recusa os errados ou repetidos', () => {
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('52998224724')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
    expect(cpfValido('5299822472')).toBe(false);
  });

  it('aceita CNPJ numérico e o alfanumérico da Receita', () => {
    expect(cnpjValido('18928966000159')).toBe(true);
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11222333000180')).toBe(false);
    expect(cnpjValido('12ABC34501DE35')).toBe(true);
    expect(cnpjValido('12ABC34501DE36')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
  });
});

describe('validarDadosNF', () => {
  it('normaliza CPF formatado, CEP e UF', () => {
    const nf = validarDadosNF({ documento: '529.982.247-25', ...endereco });
    expect(nf).toMatchObject({ tipo: 'CPF', documento: '52998224725', cep: '95660000', uf: 'RS', ibge: '4312476' });
  });

  it('identifica CNPJ (inclusive alfanumérico em minúsculas)', () => {
    expect(validarDadosNF({ documento: '18.928.966/0001-59', ...endereco })?.tipo).toBe('CNPJ');
    expect(validarDadosNF({ documento: '12.abc.345/01de-35', ...endereco })?.documento).toBe('12ABC34501DE35');
  });

  it('recusa documento inválido, UF inexistente ou endereço incompleto', () => {
    expect(validarDadosNF({ documento: '52998224724', ...endereco })).toBeNull();
    expect(validarDadosNF({ documento: '52998224725', ...endereco, uf: 'XX' })).toBeNull();
    expect(validarDadosNF({ documento: '52998224725', ...endereco, numero: '  ' })).toBeNull();
    expect(validarDadosNF({ documento: '52998224725', ...endereco, cep: '9566' })).toBeNull();
    expect(validarDadosNF(null)).toBeNull();
    expect(validarDadosNF('52998224725')).toBeNull();
  });

  it('recupera zeros à esquerda se o metadata voltar como número', () => {
    // 040.373.250-63 (CPF válido) chegando como número perde o zero inicial
    expect(validarDadosNF({ ...endereco, tipo: 'CPF', documento: 4037325063 })).toMatchObject({ documento: '04037325063' });
    const cnpj = validarDadosNF({ ...endereco, tipo: 'CNPJ', documento: 191, cep: 1310930 });
    expect(cnpj).toMatchObject({ documento: '00000000000191', cep: '01310930' });
  });

  it('limpa caracteres de controle e corta no tamanho do campo', () => {
    const nf = validarDadosNF({ documento: '52998224725', ...endereco, logradouro: 'Rua\u0000  Um\n' + 'x'.repeat(200) });
    expect(nf?.logradouro.startsWith('Rua Um x')).toBe(true);
    expect(nf?.logradouro.length).toBe(120);
  });
});

describe('payerMP', () => {
  it('manda identificação ao MP só para documento numérico', () => {
    const cpf = validarDadosNF({ documento: '52998224725', ...endereco })!;
    expect(payerMP(cpf, 'Ana')).toMatchObject({
      name: 'Ana', identification: { type: 'CPF', number: '52998224725' },
      address: { zip_code: '95660000', street_name: 'Rua Principal', street_number: '100' },
    });
    const alfa = validarDadosNF({ documento: '12ABC34501DE35', ...endereco })!;
    expect(payerMP(alfa, '')).not.toHaveProperty('identification');
  });
});
