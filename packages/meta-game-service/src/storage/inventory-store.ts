import { readFile } from 'node:fs/promises';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { PlayerInventory } from '../types/inventory.js';
import { withFileLock } from './file-store.js';
import { atomicWrite } from './atomic-write.js';

function inventoryPath(dataDir: string, playerId: string): string {
  return path.join(dataDir, 'inventories', `${playerId}.json`);
}

export async function getOrCreateInventory(
  dataDir: string,
  playerId: string
): Promise<PlayerInventory> {
  const filePath = inventoryPath(dataDir, playerId);
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as PlayerInventory;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      const fresh: PlayerInventory = {
        playerId,
        instances: {},
        stacks: {},
      };
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, JSON.stringify(fresh, null, 2), 'utf8');
      return fresh;
    }
    throw err;
  }
}

export async function updateInventory(
  dataDir: string,
  playerId: string,
  updater: (inv: PlayerInventory) => PlayerInventory | Promise<PlayerInventory>
): Promise<PlayerInventory> {
  const filePath = inventoryPath(dataDir, playerId);
  return withFileLock(filePath, async () => {
    const inv = await getOrCreateInventory(dataDir, playerId);
    const updated = await updater(inv);
    await atomicWrite(filePath, updated);
    return updated;
  });
}
