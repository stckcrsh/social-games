import type { FastifyPluginAsync } from 'fastify';
import path from 'node:path';
import { config } from '../config.js';
import { auditLog } from '../audit/audit-logger.js';
import { ProposeTradeSchema, CounterTradeSchema } from './schemas.js';
import { proposeTrade, counterTrade, approveTrade, cancelTrade, listTrades, getTrade } from './service.js';

export const tradeRoutes: FastifyPluginAsync = async (server) => {
  server.post('/', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      const user = request.user;
      const body = ProposeTradeSchema.parse(request.body);
      const trade = await proposeTrade(config.DATA_DIR, user.playerId, body);
      await auditLog(path.join(config.DATA_DIR, 'audit.jsonl'), {
        action: 'trade.propose',
        playerId: user.playerId,
        targetId: body.targetPlayerId,
        data: { tradeId: trade.tradeId, offerItems: body.offerItems },
      });
      return reply.status(201).send(trade);
    },
  });

  server.post('/:tradeId/counter', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      const user = request.user;
      const { tradeId } = request.params as { tradeId: string };
      const body = CounterTradeSchema.parse(request.body);
      const trade = await counterTrade(config.DATA_DIR, user.playerId, tradeId, body);
      await auditLog(path.join(config.DATA_DIR, 'audit.jsonl'), {
        action: 'trade.counter',
        playerId: user.playerId,
        data: { tradeId, counterItems: body.counterItems },
      });
      return trade;
    },
  });

  server.post('/:tradeId/approve', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      const user = request.user;
      const { tradeId } = request.params as { tradeId: string };
      const trade = await approveTrade(config.DATA_DIR, user.playerId, tradeId);
      const action = trade.status === 'completed' ? 'trade.complete' : 'trade.approve';
      await auditLog(path.join(config.DATA_DIR, 'audit.jsonl'), {
        action,
        playerId: user.playerId,
        data: { tradeId, status: trade.status },
      });
      return trade;
    },
  });

  server.post('/:tradeId/cancel', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      const user = request.user;
      const { tradeId } = request.params as { tradeId: string };
      const trade = await cancelTrade(config.DATA_DIR, user.playerId, tradeId);
      await auditLog(path.join(config.DATA_DIR, 'audit.jsonl'), {
        action: 'trade.cancel',
        playerId: user.playerId,
        data: { tradeId },
      });
      return trade;
    },
  });

  server.get('/', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      const user = request.user;
      return listTrades(config.DATA_DIR, user.playerId);
    },
  });

  server.get('/:tradeId', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => {
      const user = request.user;
      const { tradeId } = request.params as { tradeId: string };
      return getTrade(config.DATA_DIR, tradeId, user.playerId);
    },
  });
};
