export type ItemCategory = 'consumable' | 'gear' | 'trinket' | 'material' | 'currency';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface ItemDef {
  defId: string;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  stackable: boolean;
  maxStack: number;
  description: string;
  effects: Record<string, unknown>;
  tradeable: boolean;
}

export type GrantEntry =
  | { kind: 'stack'; defId: string; qty: number }
  | { kind: 'instance'; defId: string; qty: number };

export type OfferStock =
  | 'infinite'
  | { kind: 'limited'; remaining: number };

export interface ShopOffer {
  offerId: string;
  title: string;
  description: string;
  price: { defId: string; qty: number }[];
  grant: GrantEntry[];
  stock: OfferStock;
  limitPerPlayer?: number;
  availability?: { kind: 'always' | 'daily' | 'weekly' };
  requires?: { role?: string; unlockFlag?: string }[];
}

export interface ContentStore {
  itemDefs: Record<string, ItemDef>;
  shopOffers: Record<string, ShopOffer>;
}
