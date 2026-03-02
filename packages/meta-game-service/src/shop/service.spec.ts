import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { loadContent } from '../content/loader.js';
import { grantItems } from '../inventory/service.js';
import { getOrCreateInventory } from '../storage/inventory-store.js';
import { readJsonFile } from '../storage/file-store.js';
import type { IdempotencyStore } from '../types/shop.js';
import { purchase } from './service.js';

const SEED_DATA_DIR = path.resolve(__dirname, '../../data');

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'mgs-shop-'));
  await mkdir(path.join(dir, 'inventories'), { recursive: true });
  await writeFile(path.join(dir, 'idempotency.json'), JSON.stringify({ records: {} }), 'utf8');
  return dir;
}

beforeAll(async () => {
  await loadContent(SEED_DATA_DIR);
});

describe('purchase', () => {
  it('deducts price and grants stack item on success', async () => {
    const dir = await makeTmpDir();
    const playerId = uuidv4();

    // Grant 100 scrap (repair potion costs 50 scrap)
    await grantItems(dir, {
      playerId,
      items: [{ kind: 'stack', defId: 'scrap', qty: 100 }],
    });

    const result = await purchase(dir, playerId, 'offer_repair_potion', uuidv4());
    expect(result.status).toBe('success');

    const inv = await getOrCreateInventory(dir, playerId);
    expect(inv.stacks['scrap']).toBe(50);
    expect(inv.stacks['repair_potion']).toBe(1);
  });

  it('grants instance on instance offer', async () => {
    const dir = await makeTmpDir();
    const playerId = uuidv4();

    // Grant 200 scrap (brass dagger costs 200 scrap)
    await grantItems(dir, {
      playerId,
      items: [{ kind: 'stack', defId: 'scrap', qty: 200 }],
    });

    const result = await purchase(dir, playerId, 'offer_brass_dagger', uuidv4());
    expect(result.status).toBe('success');

    const inv = await getOrCreateInventory(dir, playerId);
    expect(Object.keys(inv.instances)).toHaveLength(1);
    expect(inv.stacks['scrap']).toBeUndefined();
  });

  it('returns insufficient_funds when not enough currency', async () => {
    const dir = await makeTmpDir();
    const playerId = uuidv4();

    // Grant only 10 scrap (need 50 for repair potion)
    await grantItems(dir, {
      playerId,
      items: [{ kind: 'stack', defId: 'scrap', qty: 10 }],
    });

    const result = await purchase(dir, playerId, 'offer_repair_potion', uuidv4());
    expect(result.status).toBe('insufficient_funds');

    // Inventory unchanged
    const inv = await getOrCreateInventory(dir, playerId);
    expect(inv.stacks['scrap']).toBe(10);
    expect(inv.stacks['repair_potion']).toBeUndefined();
  });

  it('returns offer_not_found for unknown offerId', async () => {
    const dir = await makeTmpDir();
    const playerId = uuidv4();

    const result = await purchase(dir, playerId, 'nonexistent_offer', uuidv4());
    expect(result.status).toBe('offer_not_found');
  });

  it('idempotency: same key returns same transactionId without double-deduct', async () => {
    const dir = await makeTmpDir();
    const playerId = uuidv4();
    const idemKey = uuidv4();

    await grantItems(dir, {
      playerId,
      items: [{ kind: 'stack', defId: 'scrap', qty: 200 }],
    });

    const result1 = await purchase(dir, playerId, 'offer_repair_potion', idemKey);
    expect(result1.status).toBe('success');

    const result2 = await purchase(dir, playerId, 'offer_repair_potion', idemKey);
    expect(result2.status).toBe('success');
    expect(result2.transactionId).toBe(result1.transactionId);

    // Inventory deducted only once
    const inv = await getOrCreateInventory(dir, playerId);
    expect(inv.stacks['scrap']).toBe(150); // 200 - 50, not 200 - 100
    expect(inv.stacks['repair_potion']).toBe(1);
  });

  it('20 concurrent identical keys result in exactly 1 deduction', async () => {
    const dir = await makeTmpDir();
    const playerId = uuidv4();
    const idemKey = uuidv4();

    await grantItems(dir, {
      playerId,
      items: [{ kind: 'stack', defId: 'scrap', qty: 1000 }],
    });

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        purchase(dir, playerId, 'offer_repair_potion', idemKey)
      )
    );

    // All should be success
    expect(results.every((r) => r.status === 'success')).toBe(true);

    // All should have same transactionId
    const txIds = new Set(results.map((r) => r.transactionId));
    expect(txIds.size).toBe(1);

    // Inventory deducted exactly once (50 scrap for repair potion)
    const inv = await getOrCreateInventory(dir, playerId);
    expect(inv.stacks['scrap']).toBe(950);
    expect(inv.stacks['repair_potion']).toBe(1);
  });

  it('insufficient_funds not stored in idempotency (allows retry)', async () => {
    const dir = await makeTmpDir();
    const playerId = uuidv4();
    const idemKey = uuidv4();

    // No currency
    const result1 = await purchase(dir, playerId, 'offer_repair_potion', idemKey);
    expect(result1.status).toBe('insufficient_funds');

    // Now grant currency
    await grantItems(dir, {
      playerId,
      items: [{ kind: 'stack', defId: 'scrap', qty: 100 }],
    });

    // Same key should now succeed (not replayed from idempotency store)
    const result2 = await purchase(dir, playerId, 'offer_repair_potion', idemKey);
    expect(result2.status).toBe('success');

    // Idempotency store should have 1 record
    const store = await readJsonFile<IdempotencyStore>(
      path.join(dir, 'idempotency.json')
    );
    const records = Object.values(store.records);
    expect(records).toHaveLength(1);
    expect(records[0]!.result.status).toBe('success');
  });
});
