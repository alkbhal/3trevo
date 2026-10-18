import { describe, it, expect } from 'vitest';
import { arquivoForge, assinarForge, resolverUrlExterna } from '../src/forge-download';
import type { Env } from '../src/types';

const ID = '11111111-2222-3333-4444-555555555555';
const env = { FORGE_DOWNLOAD_SECRET: 'segredo-teste' } as Env;

describe('links assinados do forge', () => {
  it('reconhece só URLs de arquivo do forge', () => {
    expect(arquivoForge(`https://tr3vo-forge.al-kbhal.workers.dev/project/${ID}/epub`, env)).toEqual({ projectId: ID, formato: 'epub' });
    expect(arquivoForge(`https://tr3vo-forge.al-kbhal.workers.dev/project/${ID}/cover`, env)).toBeNull();
    expect(arquivoForge(`https://outro.host/project/${ID}/epub`, env)).toBeNull();
    expect(arquivoForge('livro.epub', env)).toBeNull();
  });

  it('assina no formato que o forge verifica: HMAC-SHA256 de "id.formato.exp"', async () => {
    const url = await assinarForge(env, ID, 'pdf', 600, 1_800_000_000);
    // Valor de referência calculado com o mesmo segredo e mensagem (tr3vo-forge signDownload).
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('segredo-teste'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ID}.pdf.1800000600`));
    const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(url).toBe(`https://tr3vo-forge.al-kbhal.workers.dev/project/${ID}/pdf?exp=1800000600&sig=${hex}`);
  });

  it('URL do forge sai assinada; outras URLs passam iguais; sem segredo, null', async () => {
    const forge = `https://tr3vo-forge.al-kbhal.workers.dev/project/${ID}/epub`;
    expect(await resolverUrlExterna(forge, env)).toMatch(/\?exp=\d+&sig=[0-9a-f]{64}$/);
    expect(await resolverUrlExterna('https://gutenberg.org/x.epub', env)).toBe('https://gutenberg.org/x.epub');
    expect(await resolverUrlExterna(forge, {} as Env)).toBeNull();
  });
});
