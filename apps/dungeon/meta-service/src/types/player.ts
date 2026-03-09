export interface Player {
  playerId: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  roles: ('player' | 'admin')[];
  displayName?: string;
}

export interface PlayersStore {
  players: Record<string, Player>;
}
