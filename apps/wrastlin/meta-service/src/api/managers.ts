import type { FastifyInstance } from 'fastify';
import { getManager } from '../managers/managerService.js';

export async function managerRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/managers/:id', async (req, reply) => {
    const manager = getManager(req.params.id);
    if (!manager) return reply.status(404).send({ error: 'Manager not found' });
    return manager;
  });
}
