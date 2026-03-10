import Fastify from 'fastify';
import cors from '@fastify/cors';
import { wrestlerRoutes } from './api/wrestlers.js';
import { managerRoutes } from './api/managers.js';
import { submissionRoutes } from './api/submissions.js';
import { stateRoutes } from './api/state.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: 'http://localhost:4300' });

app.get('/health', async () => ({ ok: true }));

await app.register(wrestlerRoutes);
await app.register(managerRoutes);
await app.register(submissionRoutes);
await app.register(stateRoutes);

app.listen({ port: 3002, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
