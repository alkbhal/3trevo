// worker/tests/guardiao.test.ts
// Guardião no 3Trevo: cópia adaptada do motor criado no Amigo Entregador
// (guardiao/engine.js). Aqui o contrato é de SEGURANÇA e as checagens são
// assíncronas (fetch). Princípios preservados: "não sei ainda" nunca vira OK,
// exceção no check é 🟠 (não 🟡), invariante contratado nunca some em silêncio.

import { describe, it, expect } from 'vitest';
import {
  verificar, statusGeral, classificarPadrao, calcularRisco, type Invariante, type Nivel,
} from '../src/guardiao/engine';
import {
  CATALOGO, IDS_CONTRATADOS, FUNCOES_SENSIVEIS, avaliarPostura, type CtxTrevo,
} from '../src/guardiao/catalogo-3trevo';

const limpo: CtxTrevo = { postura: { funcoes_expostas: [], funcoes_ausentes: [], tabelas_sem_rls: [] }, erroPostura: null };

describe('engine — verificar', () => {
  const ok: Invariante<{ x?: string }> = {
    id: 'a', categoria: 'T', regra: 'r', resultadoEsperado: 'e', impacto: [],
    executar: async () => ({ nivel: 'confirmado', titulo: 't', explicacao: 'x', resultadoObservado: 'o' }),
  };

  it('devolve exatamente um resultado por invariante contratado + o meta-check', async () => {
    const r = await verificar({}, [ok], ['a']);
    expect(r.map(x => x.id).sort()).toEqual(['a', 'catalogo_integro']);
  });

  it('exceção no check é 🟠 divergente, não 🟡 nem 🟢', async () => {
    const quebra: Invariante<{}> = { ...ok, executar: async () => { throw new Error('boom'); } };
    const r = await verificar({}, [quebra], ['a']);
    const a = r.find(x => x.id === 'a')!;
    expect(a.nivel).toBe('divergente');
    expect(a.resultadoObservado).toContain('boom');
  });

  it('nível desconhecido vira 🟡, nunca passa como OK', async () => {
    const torto = { ...ok, executar: async () => ({ titulo: 't', explicacao: 'x', resultadoObservado: 'o' } as any) };
    const r = await verificar({}, [torto], ['a']);
    expect(r.find(x => x.id === 'a')!.nivel).toBe('nao_confirmado');
  });

  it('requisito ausente no contexto vira 🟡 e o check nem roda', async () => {
    let rodou = false;
    const exige: Invariante<{ chave?: string }> = { ...ok, requer: ['chave'], executar: async () => { rodou = true; return ok.executar({}) as any; } };
    const r = await verificar({}, [exige], ['a']);
    expect(rodou).toBe(false);
    expect(r.find(x => x.id === 'a')!.nivel).toBe('nao_confirmado');
  });

  it('invariante contratado ausente do catálogo é 🔴 (o contrato promete o que ninguém checa)', async () => {
    const r = await verificar({}, [ok], ['a', 'fantasma']);
    expect(r.find(x => x.id === 'fantasma')!.nivel).toBe('violacao');
    expect(r.find(x => x.id === 'catalogo_integro')!.nivel).toBe('violacao');
  });

  it('check no catálogo que o contrato não declara derruba o catalogo_integro', async () => {
    const r = await verificar({}, [ok, { ...ok, id: 'b' }], ['a']);
    expect(r.find(x => x.id === 'catalogo_integro')!.nivel).toBe('violacao');
  });

  it('ordena do pior para o melhor', async () => {
    const ruim: Invariante<{}> = { ...ok, id: 'ruim', executar: async () => ({ nivel: 'violacao', titulo: 't', explicacao: 'x', resultadoObservado: 'o' }) };
    const r = await verificar({}, [ok, ruim], ['a', 'ruim']);
    expect(r[0].id).toBe('ruim');
  });
});

describe('engine — statusGeral', () => {
  const r = (...n: Nivel[]) => n.map((nivel, i) => ({ id: String(i), nivel })) as any;
  it('violação vence tudo', () => expect(statusGeral(r('confirmado', 'violacao', 'nao_confirmado')).status).toBe('bloqueio'));
  it('divergente sem violação = não concluído', () => expect(statusGeral(r('confirmado', 'divergente')).status).toBe('nao_concluido'));
  it('"não sei ainda" não é OK', () => expect(statusGeral(r('confirmado', 'nao_confirmado')).status).toBe('atencao'));
  it('só confirmados = ok', () => expect(statusGeral(r('confirmado', 'confirmado')).status).toBe('ok'));
});

describe('engine — padrão histórico', () => {
  const h = (...n: Nivel[]) => n.map(nivel => ({ resultados: [{ id: 'x', nivel }] }));
  it('sem histórico não classifica', () => expect(classificarPadrao('x', 'violacao', [])).toBeNull());
  it('violação em todas as execuções = persistente', () => expect(classificarPadrao('x', 'violacao', h('violacao', 'violacao'))?.tipo).toBe('persistente'));
  it('voltou a confirmado = resolvido', () => expect(classificarPadrao('x', 'confirmado', h('violacao'))?.tipo).toBe('resolvido'));
  it('confirmado que quebra pela primeira vez = primeira_ocorrencia', () => expect(classificarPadrao('x', 'violacao', h('confirmado', 'confirmado'))?.tipo).toBe('primeira_ocorrencia'));
  it('vai e volta 3+ vezes = oscilante', () => expect(classificarPadrao('x', 'violacao', h('confirmado', 'violacao', 'confirmado'))?.tipo).toBe('oscilante'));
  it('risco precisa de 2+ execuções', () => expect(calcularRisco('x', 'violacao', h('violacao'))).toBeNull());
});

describe('catálogo 3Trevo — contrato de segurança', () => {
  it('IDS_CONTRATADOS e CATALOGO batem 1:1', () => {
    expect(CATALOGO.map(c => c.id).sort()).toEqual([...IDS_CONTRATADOS].sort());
  });

  it('vigia as funções do server que já foram encontradas abertas', () => {
    for (const f of ['registrar_compra_mp', 'apurar_sorteio_lf', 'registrar_resultado_sorteio_v2', 'aprovar_depoimento_manual', 'fila_revisao_manual']) {
      expect(FUNCOES_SENSIVEIS).toContain(f);
    }
  });

  it('postura limpa: função fechada e RLS em tudo = 🟢', () => {
    const r = avaliarPostura(limpo);
    expect(r.funcoes.nivel).toBe('confirmado');
    expect(r.rls.nivel).toBe('confirmado');
  });

  it('função sensível executável por anon = 🔴 e cita qual e para quem', () => {
    const r = avaliarPostura({ postura: { funcoes_expostas: [{ fn: 'registrar_compra_mp', roles: ['anon'] }], funcoes_ausentes: [], tabelas_sem_rls: [] }, erroPostura: null });
    expect(r.funcoes.nivel).toBe('violacao');
    expect(r.funcoes.resultadoObservado).toContain('registrar_compra_mp');
    expect(r.funcoes.resultadoObservado).toContain('anon');
  });

  it('tabela pública sem RLS = 🔴', () => {
    const r = avaliarPostura({ postura: { funcoes_expostas: [], funcoes_ausentes: [], tabelas_sem_rls: ['leads'] }, erroPostura: null });
    expect(r.rls.nivel).toBe('violacao');
    expect(r.rls.resultadoObservado).toContain('leads');
  });

  it('função vigiada que sumiu do banco = 🟡 (vigilância perdida não é OK)', () => {
    const r = avaliarPostura({ postura: { funcoes_expostas: [], funcoes_ausentes: ['apurar_sorteio_lf'], tabelas_sem_rls: [] }, erroPostura: null });
    expect(r.funcoes.nivel).toBe('nao_confirmado');
    expect(r.funcoes.resultadoObservado).toContain('apurar_sorteio_lf');
  });

  it('não conseguiu consultar o banco = 🟡 nos dois, NUNCA 🟢', () => {
    const r = avaliarPostura({ postura: null, erroPostura: 'HTTP 500' });
    expect(r.funcoes.nivel).toBe('nao_confirmado');
    expect(r.rls.nivel).toBe('nao_confirmado');
    expect(r.funcoes.resultadoObservado).toContain('HTTP 500');
  });

  it('roda de ponta a ponta pelo motor: postura limpa dá status ok', async () => {
    const r = await verificar(limpo, CATALOGO, IDS_CONTRATADOS);
    expect(statusGeral(r).status).toBe('ok');
  });

  it('roda de ponta a ponta pelo motor: função aberta dá bloqueio', async () => {
    const aberta: CtxTrevo = { postura: { funcoes_expostas: [{ fn: 'apurar_sorteio_lf', roles: ['anon', 'PUBLIC'] }], funcoes_ausentes: [], tabelas_sem_rls: [] }, erroPostura: null };
    const r = await verificar(aberta, CATALOGO, IDS_CONTRATADOS);
    expect(statusGeral(r).status).toBe('bloqueio');
  });

  it('explicação vem em português simples, sem jargão de banco', () => {
    const r = avaliarPostura({ postura: { funcoes_expostas: [{ fn: 'registrar_compra_mp', roles: ['anon'] }], funcoes_ausentes: [], tabelas_sem_rls: [] }, erroPostura: null });
    expect(r.funcoes.explicacao).not.toMatch(/SECURITY DEFINER|ACL|grantee/i);
  });
});
