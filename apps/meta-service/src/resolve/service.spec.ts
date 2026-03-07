import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { resolveEscrow } from './service.js';
import { getOrCreateInventory } from '../storage/inventory-store.js';
import { readJsonFile } from '../storage/file-store.js';
import type { PlayerInventory } from '@org/shared';
import type { ReconcilePatchInput } from './schemas.js';

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'mgs-resolve-'));
  await mkdir(path.join(dir, 'inventories'), { recursive: true });
  await writeFile(
    path.join(dir, 'escrow_resolves.json'),
    JSON.stringify({ records: {} }),
    'utf8'
  );
  return dir;
}

function makePatch(overrides: Partial<ReconcilePatchInput & { escrowId: string }> = {}): ReconcilePatchInput & { escrowId: string } {
  return {
    runId: uuidv4(),
    escrowId: uuidv4(),
    result: 'dead',
    createdAt: Date.now(),
    consume: { instances: [], stacks: {} },
    grant: { instances: [], stacks: {} },
    durabilityUpdates: [],
    ...overrides,
  };
}

describe('resolveEscrow', () => {
  it('first resolve with dead result consumes stacks from inventory', async () => {
    const dir = await makeTmpDir();
    const playerId = uuidv4();
    const escrowId = uuidv4();

    // Pre-populate inventory
    const inventoryPath = path.join(dir, 'inventories', `${playerId}.json`);
    const inv: PlayerInventory = { playerId, instances: {}, stacks: { ammo_rivet: 10 } };
    await writeFile(inventoryPath, JSON.stringify(inv), 'utf8');

    const patch = makePatch({
      escrowId,
      playerId,
      result: 'dead',
      consume: { instances: [], stacks: { ammo_rivet: 5 } },
    });

    const result = await resolveEscrow(dir, patch);
    expect(result.status).toBe('ok');

    const updated = await getOrCreateInventory(dir, playerId);
    expect(updated.stacks['ammo_rivet']).toBe(5);

    // Resolve record written
    const store = await readJsonFile<{ records: Record<string, unknown> }>(
      path.join(dir, 'escrow_resolves.json')
    );
    expect(store.records[escrowId]).toBeDefined();
  });

  it('second resolve with same escrowId and same patchHash returns deduped', async () => {
    const dir = await makeTmpDir();
    const playerId = uuidv4();
    const escrowId = uuidv4();

    const inventoryPath = path.join(dir, 'inventories', `${playerId}.json`);
    const inv: PlayerInventory = { playerId, instances: {}, stacks: { ammo_rivet: 10 } };
    await writeFile(inventoryPath, JSON.stringify(inv), 'utf8');

    const patch = makePatch({
      escrowId,
      playerId,
      result: 'dead',
      consume: { instances: [], stacks: { ammo_rivet: 3 } },
    });

    const r1 = await resolveEscrow(dir, patch);
    expect(r1.status).toBe('ok');

    const r2 = await resolveEscrow(dir, patch);
    expect(r2.status).toBe('deduped');

    // Inventory NOT double-decremented
    const updated = await getOrCreateInventory(dir, playerId);
    expect(updated.stacks['ammo_rivet']).toBe(7);
  });

  it('second resolve with same escrowId but different patchHash throws 409', async () => {
    const dir = await makeTmpDir();
    const escrowId = uuidv4();

    const patch1 = makePatch({ escrowId, result: 'dead' });
    await resolveEscrow(dir, patch1);

    const patch2 = makePatch({ escrowId, result: 'extracted' }); // different result → different hash
    await expect(resolveEscrow(dir, patch2)).rejects.toThrow('Escrow already resolved with different patch');
  });

  it('resolve with no playerId skips inventory update, writes resolve record', async () => {
    const dir = await makeTmpDir();
    const escrowId = uuidv4();

    const patch = makePatch({
      escrowId,
      playerId: undefined,
      result: 'dead',
      consume: { instances: [], stacks: { ammo_rivet: 5 } },
    });

    const result = await resolveEscrow(dir, patch);
    expect(result.status).toBe('ok');

    // No inventory file created
    const store = await readJsonFile<{ records: Record<string, unknown> }>(
      path.join(dir, 'escrow_resolves.json')
    );
    expect(store.records[escrowId]).toBeDefined();
  });
});
