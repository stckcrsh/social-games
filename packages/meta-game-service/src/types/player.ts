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

export interface JwtPayload {
  playerId: string;
  username: string;
  roles: ('player' | 'admin')[];
}

export interface RequestUser {
  playerId: string;
  username: string;
  roles: ('player' | 'admin')[];
}
