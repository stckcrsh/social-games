import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import jwt from '@fastify/jwt';
import cors from '@fastify/cors';
import { config } from './config.js';
import { authRoutes } from './auth/routes.js';
import { contentRoutes } from './content/routes.js';
import { inventoryRoutes } from './inventory/routes.js';
import { shopRoutes } from './shop/routes.js';
import { tradeRoutes } from './trades/routes.js';
import type { JwtPayload } from './types/player.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export function buildServer(): FastifyInstance {
  const server = Fastify({
    logger: config.NODE_ENV !== 'test',
  });

  server.register(cors, { origin: 'http://localhost:4200' });

  server.register(jwt, {
    secret: config.JWT_SECRET,
    sign: { expiresIn: config.JWT_EXPIRY },
  });

  server.decorate(
    'authenticate',
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply.send(err);
      }
    }
  );

  server.register(authRoutes, { prefix: '/auth' });
  server.register(contentRoutes, { prefix: '/content' });
  server.register(inventoryRoutes, { prefix: '/players' });
  server.register(shopRoutes, { prefix: '/shop' });
  server.register(tradeRoutes, { prefix: '/trades' });

  return server;
}
