// worker/tests/guardiao-monitor.test.ts
// Ligação do Guardião ao cron horário (health-monitor): violação vira ERRO
// (dispara o e-mail que já existe), "não deu para consultar" vira AVISO e
// nunca verde, e o histórico em KV alimenta o padrão (persistente etc.).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { rodarGuardiao, KV_GUARDIAO_HIST } from '../src/guardiao/monitor';

function kvFalso(inicial: Record<string, string> = {}) {
  const dados = { ...inicial };
  return {
    dados,
    get: async (k: string) => dados[k] ?? null,
    put: async (k: string, v: string) => { dados[k] = v; },
  } as any;
}
const env = (kv?: any) => ({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_KEY: 'svc', TT_KV: kv }) as any;
const respostaPostura = (p: object, ok = true, status = 200) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, status, json: async () => p })));

afterEach(() => vi.unstubAllGlobals());

describe('rodarGuardiao', () => {
  it('postura limpa: nada em erros/avisos e status ok', async () => {
    respostaPostura({ funcoes_expostas: [], funcoes_ausentes: [], tabelas_sem_rls: [] });
    const erros: string[] = [], avisos: string[] = [];
    const r = await rodarGuardiao(env(kvFalso()), erros, avisos);
    expect(erros).toEqual([]);
    expect(avisos).toEqual([]);
    expect(r.status).toBe('ok');
  });

  it('função aberta ao público vira ERRO (dispara e-mail) citando qual', async () => {
    respostaPostura({ funcoes_expostas: [{ fn: 'registrar_compra_mp', roles: ['anon'] }], funcoes_ausentes: [], tabelas_sem_rls: [] });
    const erros: string[] = [], avisos: string[] = [];
    const r = await rodarGuardiao(env(kvFalso()), erros, avisos);
    expect(r.status).toBe('bloqueio');
    expect(erros.some(e => e.includes('registrar_compra_mp') && e.includes('🔴'))).toBe(true);
  });

  it('banco inconsultável vira AVISO 🟡 e o status NÃO é ok', async () => {
    respostaPostura({}, false, 500);
    const erros: string[] = [], avisos: string[] = [];
    const r = await rodarGuardiao(env(kvFalso()), erros, avisos);
    expect(erros).toEqual([]);
    expect(avisos.length).toBeGreaterThan(0);
    expect(r.status).toBe('atencao');
  });

  it('fetch que lança não derruba o monitor', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('rede caiu'); }));
    const erros: string[] = [], avisos: string[] = [];
    const r = await rodarGuardiao(env(kvFalso()), erros, avisos);
    expect(r.status).toBe('atencao');
    expect(avisos.join(' ')).toContain('rede caiu');
  });

  it('grava o histórico e o usa: violação repetida vira "persistente"', async () => {
    const kv = kvFalso();
    respostaPostura({ funcoes_expostas: [{ fn: 'apurar_sorteio_lf', roles: ['anon'] }], funcoes_ausentes: [], tabelas_sem_rls: [] });
    await rodarGuardiao(env(kv), [], []);
    await rodarGuardiao(env(kv), [], []);
    const erros: string[] = [];
    await rodarGuardiao(env(kv), erros, []);
    expect(JSON.parse(kv.dados[KV_GUARDIAO_HIST])).toHaveLength(3);
    expect(erros.join(' ')).toContain('persistente');
  });

  it('histórico limitado às últimas 24 execuções', async () => {
    const antigo = Array.from({ length: 24 }, () => ({ quando: 'x', resultados: [] }));
    const kv = kvFalso({ [KV_GUARDIAO_HIST]: JSON.stringify(antigo) });
    respostaPostura({ funcoes_expostas: [], funcoes_ausentes: [], tabelas_sem_rls: [] });
    await rodarGuardiao(env(kv), [], []);
    expect(JSON.parse(kv.dados[KV_GUARDIAO_HIST])).toHaveLength(24);
  });

  it('histórico corrompido no KV não quebra nada', async () => {
    const kv = kvFalso({ [KV_GUARDIAO_HIST]: '{não é json' });
    respostaPostura({ funcoes_expostas: [], funcoes_ausentes: [], tabelas_sem_rls: [] });
    const r = await rodarGuardiao(env(kv), [], []);
    expect(r.status).toBe('ok');
  });

  it('sem KV configurado roda igual, só não guarda histórico', async () => {
    respostaPostura({ funcoes_expostas: [], funcoes_ausentes: [], tabelas_sem_rls: [] });
    const r = await rodarGuardiao(env(undefined), [], []);
    expect(r.status).toBe('ok');
  });
});
