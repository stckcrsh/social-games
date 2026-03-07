import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';
import { getEscrowRecord, deleteEscrowRecord } from '../resolve/service.js';

export const adminRoutes: FastifyPluginAsync = async (server) => {
  // GET /admin/escrows/:escrowId — read resolve record
  server.get<{ Params: { escrowId: string } }>('/escrows/:escrowId', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      if (!request.user.roles.includes('admin')) {
        return reply.status(403).send({ error: 'Admin role required' });
      }
      const record = await getEscrowRecord(config.DATA_DIR, request.params.escrowId);
      if (!record) return reply.status(404).send({ error: 'Escrow record not found' });
      return reply.send(record);
    },
  });

  // GET /admin/escrows/:escrowId/resolve — alias
  server.get<{ Params: { escrowId: string } }>('/escrows/:escrowId/resolve', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      if (!request.user.roles.includes('admin')) {
        return reply.status(403).send({ error: 'Admin role required' });
      }
      const record = await getEscrowRecord(config.DATA_DIR, request.params.escrowId);
      if (!record) return reply.status(404).send({ error: 'Escrow record not found' });
      return reply.send(record);
    },
  });

  // POST /admin/escrows/:escrowId/reset — delete resolve record (dev only)
  server.post<{ Params: { escrowId: string } }>('/escrows/:escrowId/reset', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      if (!request.user.roles.includes('admin')) {
        return reply.status(403).send({ error: 'Admin role required' });
      }
      if (config.NODE_ENV === 'production') {
        return reply.status(403).send({ error: 'Reset disabled in production' });
      }
      await deleteEscrowRecord(config.DATA_DIR, request.params.escrowId);
      return reply.send({ status: 'reset' });
    },
  });
};
