export type AuditAction =
  | 'player.register'
  | 'player.login'
  | 'player.login_failed'
  | 'player.logout'
  | 'player.password_change'
  | 'admin.password_reset'
  | 'inventory.grant'
  | 'inventory.burn'
  | 'inventory.transfer'
  | 'shop.purchase'
  | 'trade.propose'
  | 'trade.counter'
  | 'trade.approve'
  | 'trade.cancel'
  | 'trade.complete'
  | 'trade.expire';

export interface AuditEntry {
  timestamp: string;
  action: AuditAction;
  playerId: string;
  targetId?: string;
  idempotencyKey?: string;
  requestId?: string;
  data: Record<string, unknown>;
}
