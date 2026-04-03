import path from 'node:path';
import type { Player, PlayersStore } from './types.js';
import { readJsonFile, updateJsonFile } from './file-store.js';

function playersPath(dataDir: string): string {
  return path.join(dataDir, 'players.json');
}

export async function readPlayers(dataDir: string): Promise<PlayersStore> {
  return readJsonFile<PlayersStore>(playersPath(dataDir));
}

export async function updatePlayers(
  dataDir: string,
  updater: (store: PlayersStore) => PlayersStore | Promise<PlayersStore>
): Promise<PlayersStore> {
  return updateJsonFile<PlayersStore>(playersPath(dataDir), updater);
}

export async function findPlayerByUsername(
  dataDir: string,
  username: string
): Promise<Player | undefined> {
  const store = await readPlayers(dataDir);
  return Object.values(store.players).find(
    (p) => p.username.toLowerCase() === username.toLowerCase()
  );
}

export async function findPlayerById(
  dataDir: string,
  playerId: string
): Promise<Player | undefined> {
  const store = await readPlayers(dataDir);
  return store.players[playerId];
}
