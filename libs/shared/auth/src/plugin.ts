import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import jwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import { makeAuthRoutes } from './routes.js';
import type { JwtPayload } from './types.js';

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

export interface AuthPluginOptions {
  dataDir: string;
  jwtSecret: string;
  jwtExpiry?: string;
}

export function buildAuthPlugin(options: AuthPluginOptions): FastifyPluginAsync {
  return fp(async function authPlugin(server) {
    await server.register(jwt, {
      secret: options.jwtSecret,
      sign: { expiresIn: options.jwtExpiry ?? '7d' },
    });

    server.decorate(
      'authenticate',
      async function (request: FastifyRequest, _reply: FastifyReply) {
        await request.jwtVerify();
      }
    );

    server.register(makeAuthRoutes(options.dataDir), { prefix: '/auth' });
  });
}
