import { describe, it, expect } from 'vitest';
import { verificarAssinaturaMP } from '../src/routes/checkout';

const SEGREDO = 'segredo-de-teste';

async function assinar(mpId: string, reqId: string, ts: string, segredo = SEGREDO): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const buf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`id:${mpId};request-id:${reqId};ts:${ts}`));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function requisicao(xSignature: string, reqId: string, mpId: string): Request {
  return new Request('https://worker.test/api/webhook/pagamento', {
    method: 'POST',
    headers: { 'x-signature': xSignature, 'x-request-id': reqId, 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'payment', data: { id: mpId } }),
  });
}

describe('verificarAssinaturaMP', () => {
  it('aceita assinatura válida mesmo com timestamp de horas atrás (reenvio do MP)', async () => {
    const tsAntigo = String(Math.floor(Date.now() / 1000) - 6 * 60 * 60);
    const v1 = await assinar('190344306558', 'req-1', tsAntigo);
    const ok = await verificarAssinaturaMP(requisicao(`ts=${tsAntigo},v1=${v1}`, 'req-1', '190344306558'), SEGREDO);
    expect(ok).toBe(true);
  });

  it('recusa assinatura com segredo errado', async () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = await assinar('190344306558', 'req-1', ts, 'outro-segredo');
    const ok = await verificarAssinaturaMP(requisicao(`ts=${ts},v1=${v1}`, 'req-1', '190344306558'), SEGREDO);
    expect(ok).toBe(false);
  });

  it('recusa quando o timestamp não existe', async () => {
    const ok = await verificarAssinaturaMP(requisicao('v1=abc', 'req-1', '190344306558'), SEGREDO);
    expect(ok).toBe(false);
  });
});
