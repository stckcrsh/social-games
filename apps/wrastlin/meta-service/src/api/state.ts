import type { FastifyInstance } from 'fastify';
import { getState, transitionTo } from '../core/weeklyOrchestrator.js';

export async function stateRoutes(app: FastifyInstance) {
  app.get('/state', async () => getState());

  app.post('/state/close-submissions', async (_, reply) => {
    try {
      const next = transitionTo('submissions_closed');
      return next;
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // Called after show generation to start the next week
  app.post('/state/advance-week', async (_, reply) => {
    try {
      const next = transitionTo('week_open');
      return next;
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });
}
