import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { hashPassword, verifyPassword } from './crypto.js';
import {
  findPlayerByUsername,
  findPlayerById,
  updatePlayers,
} from './players-store.js';
import {
  RegisterBodySchema,
  LoginBodySchema,
  ChangePasswordBodySchema,
  AdminResetPasswordBodySchema,
} from './schemas.js';
import type { JwtPayload } from './types.js';

export function makeHandlers(dataDir: string) {
  return {
    async register(
      server: FastifyInstance,
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<unknown> {
      const { username, password, displayName } = RegisterBodySchema.parse(request.body);

      const existing = await findPlayerByUsername(dataDir, username);
      if (existing) {
        return reply.status(409).send({ error: 'Username already taken' });
      }

      const playerId = randomUUID();
      const passwordHash = await hashPassword(password);
      const now = new Date().toISOString();

      await updatePlayers(dataDir, (store) => {
        store.players[playerId] = {
          playerId,
          username,
          passwordHash,
          createdAt: now,
          roles: ['player'],
          ...(displayName ? { displayName } : {}),
        };
        return store;
      });

      return reply.status(201).send({ playerId, username });
    },

    async login(
      server: FastifyInstance,
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<unknown> {
      const { username, password } = LoginBodySchema.parse(request.body);
      const player = await findPlayerByUsername(dataDir, username);

      if (!player) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const valid = await verifyPassword(password, player.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const payload: JwtPayload = {
        playerId: player.playerId,
        username: player.username,
        roles: player.roles,
      };
      const token = server.jwt.sign(payload);

      return { token, playerId: player.playerId, username: player.username };
    },

    async logout(
      _request: FastifyRequest,
      reply: FastifyReply
    ): Promise<unknown> {
      return reply.status(204).send();
    },

    async changePassword(
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<unknown> {
      const user = request.user as JwtPayload;
      const { currentPassword, newPassword } = ChangePasswordBodySchema.parse(request.body);

      const player = await findPlayerById(dataDir, user.playerId);
      if (!player) {
        return reply.status(404).send({ error: 'Player not found' });
      }

      const valid = await verifyPassword(currentPassword, player.passwordHash);
      if (!valid) {
        return reply.status(401).send({ error: 'Current password is incorrect' });
      }

      const newHash = await hashPassword(newPassword);
      await updatePlayers(dataDir, (store) => {
        store.players[player.playerId] = {
          ...store.players[player.playerId]!,
          passwordHash: newHash,
        };
        return store;
      });

      return reply.status(204).send();
    },

    async adminResetPassword(
      request: FastifyRequest,
      reply: FastifyReply
    ): Promise<unknown> {
      const actor = request.user as JwtPayload;
      if (!actor.roles.includes('admin')) {
        return reply.status(403).send({ error: 'Admin role required' });
      }

      const { targetUsername, newPassword } = AdminResetPasswordBodySchema.parse(request.body);
      const target = await findPlayerByUsername(dataDir, targetUsername);
      if (!target) {
        return reply.status(404).send({ error: 'Target player not found' });
      }

      const newHash = await hashPassword(newPassword);
      await updatePlayers(dataDir, (store) => {
        store.players[target.playerId] = {
          ...store.players[target.playerId]!,
          passwordHash: newHash,
        };
        return store;
      });

      return reply.status(204).send();
    },
  };
}
