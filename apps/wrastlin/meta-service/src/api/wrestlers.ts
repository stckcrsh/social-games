import type { FastifyInstance } from 'fastify';
import { loadWrestlers } from '../core/gameState.js';
import { getWrestler } from '../wrestlers/wrestlerState.js';

export async function wrestlerRoutes(app: FastifyInstance) {
  app.get('/wrestlers', async () => {
    return loadWrestlers();
  });

  app.get<{ Params: { id: string } }>('/wrestlers/:id', async (req, reply) => {
    const wrestler = getWrestler(req.params.id);
    if (!wrestler) return reply.status(404).send({ error: 'Wrestler not found' });
    return wrestler;
  });
}
