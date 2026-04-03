import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { buildAuthPlugin } from '@org/auth';
import type { JwtPayload } from '@org/auth';
import { wrestlerRoutes } from './api/wrestlers.js';
import { managerRoutes } from './api/managers.js';
import { submissionRoutes } from './api/submissions.js';
import { stateRoutes } from './api/state.js';
import { bettingRoutes } from './api/betting.js';
import { meRoute } from './api/me.js';
import path from 'node:path';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const JWT_SECRET = process.env['JWT_SECRET'];
if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error('JWT_SECRET env var required (min 16 chars)');
  process.exit(1);
}

const DYNAMIC_DATA_DIR = process.env['DYNAMIC_DATA_DIR']
  ?? path.resolve(import.meta.dirname, '../data/runtime');

const app = Fastify({ logger: true });

await app.register(cors, { origin: 'http://localhost:4300' });
await app.register(buildAuthPlugin({ dataDir: DYNAMIC_DATA_DIR, jwtSecret: JWT_SECRET }));

app.get('/health', async () => ({ ok: true }));

await app.register(wrestlerRoutes);
await app.register(managerRoutes);
await app.register(submissionRoutes);
await app.register(stateRoutes);
await app.register(bettingRoutes);
await app.register(meRoute);

app.listen({ port: 3002, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
