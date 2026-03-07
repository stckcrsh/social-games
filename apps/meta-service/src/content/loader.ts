import path from 'node:path';
import type { ContentStore } from '../types/content.js';
import { readJsonFile } from '../storage/file-store.js';
import { ItemDefsFileSchema, ShopOffersFileSchema } from './schemas.js';
import { META_DEFS } from '@org/items';

let contentStore: ContentStore | null = null;

export async function loadContent(dataDir: string): Promise<ContentStore> {
  const itemDefsRaw = await readJsonFile<unknown>(path.join(dataDir, 'item_defs.json'));
  const shopOffersRaw = await readJsonFile<unknown>(path.join(dataDir, 'shop_offers.json'));

  const jsonItemDefs = ItemDefsFileSchema.parse(itemDefsRaw);
  const shopOffers = ShopOffersFileSchema.parse(shopOffersRaw);

  // Merge dungeon item defs from @org/items with the JSON-defined meta items
  const itemDefs = { ...jsonItemDefs, ...META_DEFS };

  contentStore = { itemDefs, shopOffers };
  return contentStore;
}

export function getContent(): ContentStore {
  if (!contentStore) {
    throw new Error('Content not loaded. Call loadContent() first.');
  }
  return contentStore;
}
