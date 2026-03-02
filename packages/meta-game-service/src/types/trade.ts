export type TradeStatus =
  | 'awaiting_counter'
  | 'awaiting_approval'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type TradeItem =
  | { kind: 'stack'; defId: string; qty: number }
  | { kind: 'instance'; itemId: string };

export interface EscrowSlot {
  items: TradeItem[];
  instanceData: Record<string, { itemId: string; defId: string; createdAt: string; durability?: number; mods?: Record<string, unknown> }>;
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

export interface TradesStore {
  trades: Record<string, TradeOffer>;
}
