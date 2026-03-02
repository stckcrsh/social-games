import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './crypto.js';

// NODE_ENV=test → bcrypt rounds=1 (fast)

describe('hashPassword / verifyPassword', () => {
  it('verifies correct password', async () => {
    const hash = await hashPassword('correct-password');
    const ok = await verifyPassword('correct-password', hash);
    expect(ok).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('correct-password');
    const ok = await verifyPassword('wrong-password', hash);
    expect(ok).toBe(false);
  });

  it('generates different salts for same password', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    expect(hash1).not.toBe(hash2);
  });

  it('cross-verifies are consistent', async () => {
    const hash = await hashPassword('my-secret');
    expect(await verifyPassword('my-secret', hash)).toBe(true);
    expect(await verifyPassword('My-Secret', hash)).toBe(false);
  });
});
