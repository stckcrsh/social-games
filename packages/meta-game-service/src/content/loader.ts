import path from 'node:path';
import type { ContentStore } from '../types/content.js';
import { readJsonFile } from '../storage/file-store.js';
import { ItemDefsFileSchema, ShopOffersFileSchema } from './schemas.js';

let contentStore: ContentStore | null = null;

export async function loadContent(dataDir: string): Promise<ContentStore> {
  const itemDefsRaw = await readJsonFile<unknown>(path.join(dataDir, 'item_defs.json'));
  const shopOffersRaw = await readJsonFile<unknown>(path.join(dataDir, 'shop_offers.json'));

  const itemDefs = ItemDefsFileSchema.parse(itemDefsRaw);
  const shopOffers = ShopOffersFileSchema.parse(shopOffersRaw);

  contentStore = { itemDefs, shopOffers };
  return contentStore;
}

export function getContent(): ContentStore {
  if (!contentStore) {
    throw new Error('Content not loaded. Call loadContent() first.');
  }
  return contentStore;
}
