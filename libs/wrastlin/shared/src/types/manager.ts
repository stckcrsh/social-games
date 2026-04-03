export type TrustLevel = 'low' | 'medium' | 'high';

export interface Manager {
  managerId: string;
  wrestlerId: string;
  money: number;
  trustLevel: TrustLevel;
  playerId: string;
}
