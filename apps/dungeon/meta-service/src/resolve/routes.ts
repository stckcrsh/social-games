import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { ReconcilePatchSchema } from './schemas.js';
import { resolveEscrow } from './service.js';

export const runResolveRoutes: FastifyPluginAsync = async (server) => {
  // POST /runs/escrows/:escrowId/resolve — service-to-service, no auth required
  server.post<{ Params: { escrowId: string } }>('/escrows/:escrowId/resolve', async (request, reply) => {
    const { escrowId } = request.params;

    const parseResult = ReconcilePatchSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten() });
    }

    const patch = { ...parseResult.data, escrowId };

    try {
      const result = await resolveEscrow(config.DATA_DIR, patch);
      return reply.send(result);
    } catch (err: unknown) {
      if (err instanceof Error && (err as Error & { statusCode?: number }).statusCode === 409) {
        return reply.status(409).send({ error: err.message });
      }
      throw err;
    }
  });
};
