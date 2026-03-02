import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { auditLog } from '../audit/audit-logger.js';
import {
  GrantItemsBodySchema,
  BurnItemsBodySchema,
  TransferItemsBodySchema,
} from './schemas.js';
import { grantItems, burnItems, transferItems, getInventory } from './service.js';
import path from 'node:path';

export const inventoryRoutes: FastifyPluginAsync = async (server) => {
  server.get('/me/inventory', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      const user = request.user;
      const inv = await getInventory(config.DATA_DIR, user.playerId);
      return inv;
    },
  });

  server.post('/me/inventory/grant', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      const user = request.user;
      if (!user.roles.includes('admin')) {
        return reply.status(403).send({ error: 'Admin role required' });
      }
      const body = GrantItemsBodySchema.parse(request.body);
      const inv = await grantItems(config.DATA_DIR, body);
      await auditLog(path.join(config.DATA_DIR, 'audit.jsonl'), {
        action: 'inventory.grant',
        playerId: user.playerId,
        targetId: body.playerId,
        data: { items: body.items },
      });
      return inv;
    },
  });

  server.post('/me/inventory/burn', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      const user = request.user;
      if (!user.roles.includes('admin')) {
        return reply.status(403).send({ error: 'Admin role required' });
      }
      const body = BurnItemsBodySchema.parse(request.body);
      const inv = await burnItems(config.DATA_DIR, body);
      await auditLog(path.join(config.DATA_DIR, 'audit.jsonl'), {
        action: 'inventory.burn',
        playerId: user.playerId,
        targetId: body.playerId,
        data: { items: body.items },
      });
      return inv;
    },
  });

  server.post('/me/inventory/transfer', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      const user = request.user;
      if (!user.roles.includes('admin')) {
        return reply.status(403).send({ error: 'Admin role required' });
      }
      const body = TransferItemsBodySchema.parse(request.body);
      const result = await transferItems(config.DATA_DIR, body);
      await auditLog(path.join(config.DATA_DIR, 'audit.jsonl'), {
        action: 'inventory.transfer',
        playerId: user.playerId,
        data: {
          fromPlayerId: body.fromPlayerId,
          toPlayerId: body.toPlayerId,
          items: body.items,
        },
      });
      return result;
    },
  });
};
