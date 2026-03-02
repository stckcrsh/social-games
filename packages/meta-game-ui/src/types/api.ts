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

export interface ItemInstance {
  itemId: string;
  defId: string;
  createdAt: string;
  durability?: number;
  mods?: Record<string, unknown>;
}

export interface PlayerInventory {
  playerId: string;
  instances: Record<string, ItemInstance>;
  stacks: Record<string, number>;
}

export interface JwtPayload {
  playerId: string;
  username: string;
  roles: ('player' | 'admin')[];
}

export type TradeStatus = 'awaiting_counter' | 'awaiting_approval' | 'completed' | 'cancelled' | 'expired';

export type TradeItem =
  | { kind: 'stack'; defId: string; qty: number }
  | { kind: 'instance'; itemId: string };

export interface EscrowSlot {
  items: TradeItem[];
  instanceData: Record<string, unknown>;
}

export interface TradeOffer {
  tradeId: string;
  proposerId: string;
  targetId: string;
  proposerEscrow: EscrowSlot;
  targetEscrow: EscrowSlot | null;
  proposerApproved: boolean;
  targetApproved: boolean;
  status: TradeStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}
