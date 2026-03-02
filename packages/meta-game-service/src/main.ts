import './polyfill.js'; // must be first — patches diagnostics_channel for Node 18
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { buildServer } from './server.js';
import { loadContent } from './content/loader.js';

async function ensureFile(filePath: string, initial: unknown): Promise<void> {
  try {
    await access(filePath);
  } catch {
    await writeFile(filePath, JSON.stringify(initial, null, 2), 'utf8');
  }
}

async function bootstrap(): Promise<void> {
  const dataDir = config.DATA_DIR;

  await mkdir(path.join(dataDir, 'inventories'), { recursive: true });

  await ensureFile(path.join(dataDir, 'players.json'), { players: {} });
  await ensureFile(path.join(dataDir, 'idempotency.json'), { records: {} });
  await ensureFile(path.join(dataDir, 'trades.json'), { trades: {} });

  await loadContent(dataDir);

  const server = buildServer();
  await server.ready();

  const address = await server.listen({ port: config.PORT, host: config.HOST });
  console.log(`meta-game-service listening on ${address}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
