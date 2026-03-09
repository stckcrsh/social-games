import Fastify from 'fastify';
import cors from '@fastify/cors';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { HOST, PORT, DATA_DIR } from './config.js';
import { runsPlugin } from './api/routes.js';
import { wsPlugin } from './api/ws.js';

async function bootstrap(): Promise<void> {
  await mkdir(path.join(DATA_DIR, 'reconcile_outbox'), { recursive: true });

  const server = Fastify({ logger: true });

  server.register(cors, { origin: true });
  server.get('/health', async () => ({ status: 'ok' }));
  server.register(runsPlugin);
  server.register(wsPlugin);

  const address = await server.listen({ port: PORT, host: HOST });
  server.log.info(`Dungeon Engine listening at ${address}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
