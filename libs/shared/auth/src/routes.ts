import type { FastifyPluginAsync } from 'fastify';
import { makeHandlers } from './handlers.js';

export function makeAuthRoutes(dataDir: string): FastifyPluginAsync {
  const handlers = makeHandlers(dataDir);

  return async function authRoutes(server) {
    server.post('/register', async (request, reply) =>
      handlers.register(server, request, reply)
    );

    server.post('/login', async (request, reply) =>
      handlers.login(server, request, reply)
    );

    server.post('/logout', {
      onRequest: [server.authenticate],
      handler: async (request, reply) => handlers.logout(request, reply),
    });

    server.post('/change-password', {
      onRequest: [server.authenticate],
      handler: async (request, reply) => handlers.changePassword(request, reply),
    });

    server.post('/admin/reset-password', {
      onRequest: [server.authenticate],
      handler: async (request, reply) => handlers.adminResetPassword(request, reply),
    });
  };
}
