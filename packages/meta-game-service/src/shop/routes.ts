import type { FastifyPluginAsync } from 'fastify';
import { getContent } from '../content/loader.js';
import { config } from '../config.js';
import { PurchaseBodySchema } from './schemas.js';
import { purchase } from './service.js';

export const shopRoutes: FastifyPluginAsync = async (server) => {
  server.get('/offers', async (_request, _reply) => {
    const { shopOffers } = getContent();
    return Object.values(shopOffers);
  });

  server.post('/purchase', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      const user = request.user;
      const { offerId, idempotencyKey } = PurchaseBodySchema.parse(request.body);
      const result = await purchase(config.DATA_DIR, user.playerId, offerId, idempotencyKey);
      if (result.status === 'offer_not_found') {
        return reply.status(404).send(result);
      }
      return result;
    },
  });
};
