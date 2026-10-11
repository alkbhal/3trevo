import { describe, it, expect } from 'vitest';
import { handleAdminLogin } from '../src/routes/admin-auth';

const req = (body: unknown) =>
  new Request('https://x.test/api/admin/login', { method: 'POST', body: JSON.stringify(body) });

describe('admin login: validacao de entrada', () => {
  it('rejeita senha ausente', async () => {
    expect((await handleAdminLogin(req({}), {} as any)).status).toBe(400);
  });
  it('rejeita senha que nao e texto', async () => {
    expect((await handleAdminLogin(req({ pin: 123456 }), {} as any)).status).toBe(400);
  });
  it('rejeita senha acima de 128 caracteres antes de tocar no banco', async () => {
    expect((await handleAdminLogin(req({ pin: 'a'.repeat(200) }), {} as any)).status).toBe(400);
  });
});
