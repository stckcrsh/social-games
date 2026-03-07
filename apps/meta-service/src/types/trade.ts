import type { TradeOffer } from '@org/shared';

export interface TradesStore {
  trades: Record<string, TradeOffer>;
}
