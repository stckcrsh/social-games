import type { IdempotencyStore, IdempotencyRecord } from '../types/shop.js';
import { readJsonFile, withFileLock } from './file-store.js';
import { atomicWrite } from './atomic-write.js';

export function idempotencyKey(playerId: string, key: string): string {
  return `${playerId}:${key}`;
}

export async function readIdempotencyStore(dataDir: string): Promise<IdempotencyStore> {
  return readJsonFile<IdempotencyStore>(`${dataDir}/idempotency.json`);
}

export async function updateIdempotencyStore(
  dataDir: string,
  updater: (store: IdempotencyStore) => IdempotencyStore | Promise<IdempotencyStore>
): Promise<IdempotencyStore> {
  const filePath = `${dataDir}/idempotency.json`;
  return withFileLock(filePath, async () => {
    const current = await readIdempotencyStore(dataDir);
    const updated = await updater(current);
    await atomicWrite(filePath, updated);
    return updated;
  });
}

export async function getIdempotencyRecord(
  dataDir: string,
  playerId: string,
  key: string
): Promise<IdempotencyRecord | undefined> {
  const store = await readIdempotencyStore(dataDir);
  return store.records[idempotencyKey(playerId, key)];
}
