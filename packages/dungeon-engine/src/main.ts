import Fastify from 'fastify';
import { HOST, PORT } from './config.js';
import { runsPlugin } from './api/routes.js';

const server = Fastify({ logger: true });

server.register(runsPlugin);

server.listen({ port: PORT, host: HOST }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
  server.log.info(`Dungeon Engine listening at ${address}`);
});
