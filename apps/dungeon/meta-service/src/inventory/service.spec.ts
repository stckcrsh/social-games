import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadContent } from '../content/loader.js';
import { grantItems, burnItems } from './service.js';

const SEED_DATA_DIR = path.resolve(__dirname, '../../data');

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'mgs-inv-'));
  await mkdir(path.join(dir, 'inventories'), { recursive: true });
  return dir;
}

beforeAll(async () => {
  await loadContent(SEED_DATA_DIR);
});

describe('grantItems', () => {
  it('increments stack quantity', async () => {
    const dir = await makeTmpDir();
    const playerId = 'player-grant-test';

    await grantItems(dir, {
      playerId,
      items: [{ kind: 'stack', defId: 'scrap', qty: 100 }],
    });

    const inv = await grantItems(dir, {
      playerId,
      items: [{ kind: 'stack', defId: 'scrap', qty: 50 }],
    });

    expect(inv.stacks['scrap']).toBe(150);
  });

  it('creates instance item with a UUID', async () => {
    const dir = await makeTmpDir();
    const playerId = 'player-instance-test';

    const inv = await grantItems(dir, {
      playerId,
      items: [{ kind: 'instance', defId: 'brass_dagger', qty: 1 }],
    });

    const instanceIds = Object.keys(inv.instances);
    expect(instanceIds).toHaveLength(1);
    const instance = inv.instances[instanceIds[0]!]!;
    expect(instance.defId).toBe('brass_dagger');
    expect(instance.itemId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it('grants multiple instances for qty > 1', async () => {
    const dir = await makeTmpDir();
    const playerId = 'player-multi-instance';

    const inv = await grantItems(dir, {
      playerId,
      items: [{ kind: 'instance', defId: 'brass_dagger', qty: 3 }],
    });

    expect(Object.keys(inv.instances)).toHaveLength(3);
  });

  it('throws on unknown defId', async () => {
    const dir = await makeTmpDir();
    await expect(
      grantItems(dir, {
        playerId: 'player-x',
        items: [{ kind: 'stack', defId: 'nonexistent_item', qty: 1 }],
      })
    ).rejects.toThrow('Unknown defId');
  });
});

describe('burnItems', () => {
  it('deducts stack quantity', async () => {
    const dir = await makeTmpDir();
    const playerId = 'player-burn-test';

    await grantItems(dir, {
      playerId,
      items: [{ kind: 'stack', defId: 'scrap', qty: 100 }],
    });

    const inv = await burnItems(dir, {
      playerId,
      items: [{ kind: 'stack', defId: 'scrap', qty: 40 }],
    });

    expect(inv.stacks['scrap']).toBe(60);
  });

  it('removes stack entry when qty reaches 0', async () => {
    const dir = await makeTmpDir();
    const playerId = 'player-burn-zero';

    await grantItems(dir, {
      playerId,
      items: [{ kind: 'stack', defId: 'scrap', qty: 50 }],
    });

    const inv = await burnItems(dir, {
      playerId,
      items: [{ kind: 'stack', defId: 'scrap', qty: 50 }],
    });

    expect(inv.stacks['scrap']).toBeUndefined();
  });

  it('throws when burning more than available', async () => {
    const dir = await makeTmpDir();
    const playerId = 'player-burn-neg';

    await grantItems(dir, {
      playerId,
      items: [{ kind: 'stack', defId: 'scrap', qty: 10 }],
    });

    await expect(
      burnItems(dir, {
        playerId,
        items: [{ kind: 'stack', defId: 'scrap', qty: 20 }],
      })
    ).rejects.toThrow('Insufficient stack');
  });

  it('throws when burning instance not in inventory', async () => {
    const dir = await makeTmpDir();
    const playerId = 'player-burn-inst';

    await expect(
      burnItems(dir, {
        playerId,
        items: [{ kind: 'instance', itemId: 'nonexistent-uuid' }],
      })
    ).rejects.toThrow('not found');
  });
});
