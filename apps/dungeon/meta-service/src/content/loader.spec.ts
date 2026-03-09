import { describe, it, expect } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadContent } from './loader.js';

const SEED_DATA_DIR = path.resolve(__dirname, '../../data');

async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'mgs-content-'));
}

describe('loadContent', () => {
  it('loads seed item_defs and shop_offers', async () => {
    const content = await loadContent(SEED_DATA_DIR);
    expect(Object.keys(content.itemDefs).length).toBeGreaterThan(0);
    expect(Object.keys(content.shopOffers).length).toBeGreaterThan(0);
  });

  it('seed item defs have correct shape', async () => {
    const content = await loadContent(SEED_DATA_DIR);
    const scrap = content.itemDefs['scrap'];
    expect(scrap).toBeDefined();
    expect(scrap!.stackable).toBe(true);
    expect(scrap!.category).toBe('material');
  });

  it('seed shop offers have correct shape', async () => {
    const content = await loadContent(SEED_DATA_DIR);
    const offer = content.shopOffers['offer_brass_dagger'];
    expect(offer).toBeDefined();
    expect(offer!.grant[0]!.kind).toBe('instance');
  });

  it('throws on missing item_defs.json', async () => {
    const dir = await makeTmpDir();
    // Only write shop offers, not item_defs
    await writeFile(
      path.join(dir, 'shop_offers.json'),
      JSON.stringify({}),
      'utf8'
    );
    await expect(loadContent(dir)).rejects.toThrow();
  });

  it('throws on malformed item_defs.json', async () => {
    const dir = await makeTmpDir();
    await writeFile(path.join(dir, 'item_defs.json'), '{ "bad": "data" }', 'utf8');
    await writeFile(path.join(dir, 'shop_offers.json'), JSON.stringify({}), 'utf8');
    // Zod should reject item with missing required fields
    // "bad" key has value "data" which is a string, not an ItemDef object
    await expect(loadContent(dir)).rejects.toThrow();
  });
});
