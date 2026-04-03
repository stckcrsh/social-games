import type { FastifyPluginAsync } from 'fastify';
import type { JwtPayload } from '@org/auth';
import { loadManagers, loadWrestlers } from '../core/gameState.js';

export const meRoute: FastifyPluginAsync = async (server) => {
  server.get('/me', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      const { playerId } = request.user as JwtPayload;
      const managers = loadManagers();
      const manager = managers.find(m => m.playerId === playerId);
      if (!manager) {
        return reply.status(404).send({ error: 'Manager not found for this player' });
      }
      const wrestlers = loadWrestlers();
      const wrestler = wrestlers.find(w => w.wrestlerId === manager.wrestlerId) ?? null;
      return { manager, wrestler };
    },
  });
};
