import type { MetaItemDef, ShopOffer } from '@org/shared';

export interface ContentStore {
  itemDefs: Record<string, MetaItemDef>;
  shopOffers: Record<string, ShopOffer>;
}
