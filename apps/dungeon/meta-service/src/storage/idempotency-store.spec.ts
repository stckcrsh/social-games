import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  idempotencyKey,
  readIdempotencyStore,
  updateIdempotencyStore,
} from './idempotency-store.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'mgs-idem-'));
}

async function seedIdempotencyFile(dir: string): Promise<void> {
  await writeFile(
    path.join(dir, 'idempotency.json'),
    JSON.stringify({ records: {} }),
    'utf8'
  );
}

describe('idempotencyKey', () => {
  it('formats as playerId:key', () => {
    expect(idempotencyKey('player-1', 'purchase-abc')).toBe('player-1:purchase-abc');
  });
});

describe('idempotency store round-trip', () => {
  it('writes and reads a record', async () => {
    const dir = await makeTmpDir();
    await seedIdempotencyFile(dir);

    const record = {
      result: {
        status: 'success' as const,
        transactionId: 'txn-1',
        offerId: 'offer_1',
        idempotencyKey: 'key-1',
      },
      playerId: 'player-1',
      createdAt: new Date().toISOString(),
    };

    await updateIdempotencyStore(dir, (store) => {
      store.records['player-1:key-1'] = record;
      return store;
    });

    const loaded = await readIdempotencyStore(dir);
    expect(loaded.records['player-1:key-1']).toEqual(record);
  });
});
