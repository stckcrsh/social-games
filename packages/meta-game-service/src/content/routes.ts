import type { FastifyPluginAsync } from 'fastify';
import { getContent } from './loader.js';

export const contentRoutes: FastifyPluginAsync = async (server) => {
  server.get('/item-defs', async (_request, _reply) => {
    const { itemDefs } = getContent();
    return Object.values(itemDefs);
  });

  server.get<{ Params: { defId: string } }>('/item-defs/:defId', async (request, reply) => {
    const { itemDefs } = getContent();
    const def = itemDefs[request.params.defId];
    if (!def) {
      return reply.status(404).send({ error: 'Item definition not found' });
    }
    return def;
  });
};
