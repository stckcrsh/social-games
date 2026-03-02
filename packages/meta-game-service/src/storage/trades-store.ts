import path from 'node:path';
import { withFileLock, readJsonFile } from './file-store.js';
import { atomicWrite } from './atomic-write.js';
import type { TradesStore } from '../types/trade.js';

export function tradesPath(dataDir: string): string {
  return path.join(dataDir, 'trades.json');
}

export function inventoryPath(dataDir: string, playerId: string): string {
  return path.join(dataDir, 'inventories', `${playerId}.json`);
}

// Acquire trades lock first, then run fn.
// fn is responsible for acquiring any inventory locks it needs (in path-sorted order).
export async function withTradesLock<T>(
  dataDir: string,
  fn: (store: TradesStore, saveStore: (s: TradesStore) => Promise<void>) => Promise<T>
): Promise<T> {
  const tp = tradesPath(dataDir);
  return withFileLock(tp, async () => {
    const store = await readJsonFile<TradesStore>(tp);
    const saveStore = (s: TradesStore) => atomicWrite(tp, s);
    return fn(store, saveStore);
  });
}
