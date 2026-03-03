import Fastify from 'fastify';
import cors from '@fastify/cors';
import { HOST, PORT } from './config.js';
import { runsPlugin } from './api/routes.js';
import { wsPlugin } from './api/ws.js';

const server = Fastify({ logger: true });

server.register(cors, { origin: true });
server.register(runsPlugin);
server.register(wsPlugin);

server.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`Dungeon Engine listening at ${address}`);
});
