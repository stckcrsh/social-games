export interface PurchaseResult {
  status: 'success' | 'insufficient_funds' | 'offer_not_found';
  transactionId: string;
  offerId: string;
  idempotencyKey: string;
}

export interface IdempotencyRecord {
  result: PurchaseResult;
  playerId: string;
  createdAt: string;
}

export interface IdempotencyStore {
  records: Record<string, IdempotencyRecord>;
}
