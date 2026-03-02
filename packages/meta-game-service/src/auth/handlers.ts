import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import { config } from '../config.js';
import { auditLog } from '../audit/audit-logger.js';
import { hashPassword, verifyPassword } from './crypto.js';
import { findPlayerByUsername, findPlayerById, updatePlayers } from '../storage/players-store.js';
import {
  RegisterBodySchema,
  LoginBodySchema,
  ChangePasswordBodySchema,
  AdminResetPasswordBodySchema,
} from './schemas.js';

export async function handleRegister(
  server: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<unknown> {
  const { username, password, displayName } = RegisterBodySchema.parse(request.body);

  const existing = await findPlayerByUsername(config.DATA_DIR, username);
  if (existing) {
    return reply.status(409).send({ error: 'Username already taken' });
  }

  const playerId = uuidv4();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  await updatePlayers(config.DATA_DIR, (store) => {
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

  await auditLog(path.join(config.DATA_DIR, 'audit.jsonl'), {
    action: 'player.register',
    playerId,
    data: { username },
  });

  return reply.status(201).send({ playerId, username });
}

export async function handleLogin(
  server: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<unknown> {
  const { username, password } = LoginBodySchema.parse(request.body);
  const player = await findPlayerByUsername(config.DATA_DIR, username);

  if (!player) {
    return reply.status(401).send({ error: 'Invalid credentials' });
  }

  const valid = await verifyPassword(password, player.passwordHash);
  if (!valid) {
    await auditLog(path.join(config.DATA_DIR, 'audit.jsonl'), {
      action: 'player.login_failed',
      playerId: player.playerId,
      data: { username },
    });
    return reply.status(401).send({ error: 'Invalid credentials' });
  }

  const token = server.jwt.sign({
    playerId: player.playerId,
    username: player.username,
    roles: player.roles,
  });

  await auditLog(path.join(config.DATA_DIR, 'audit.jsonl'), {
    action: 'player.login',
    playerId: player.playerId,
    data: {},
  });

  return { token, playerId: player.playerId, username: player.username };
}

export async function handleLogout(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<unknown> {
  const user = request.user;
  await auditLog(path.join(config.DATA_DIR, 'audit.jsonl'), {
    action: 'player.logout',
    playerId: user.playerId,
    data: {},
  });
  return reply.status(204).send();
}

export async function handleChangePassword(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<unknown> {
  const user = request.user;
  const { currentPassword, newPassword } = ChangePasswordBodySchema.parse(request.body);

  const player = await findPlayerById(config.DATA_DIR, user.playerId);
  if (!player) {
    return reply.status(404).send({ error: 'Player not found' });
  }

  const valid = await verifyPassword(currentPassword, player.passwordHash);
  if (!valid) {
    return reply.status(401).send({ error: 'Current password is incorrect' });
  }

  const newHash = await hashPassword(newPassword);
  await updatePlayers(config.DATA_DIR, (store) => {
    store.players[player.playerId] = { ...store.players[player.playerId]!, passwordHash: newHash };
    return store;
  });

  await auditLog(path.join(config.DATA_DIR, 'audit.jsonl'), {
    action: 'player.password_change',
    playerId: player.playerId,
    data: {},
  });

  return reply.status(204).send();
}

export async function handleAdminResetPassword(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<unknown> {
  const actor = request.user;
  if (!actor.roles.includes('admin')) {
    return reply.status(403).send({ error: 'Admin role required' });
  }

  const { targetUsername, newPassword } = AdminResetPasswordBodySchema.parse(request.body);
  const target = await findPlayerByUsername(config.DATA_DIR, targetUsername);
  if (!target) {
    return reply.status(404).send({ error: 'Target player not found' });
  }

  const newHash = await hashPassword(newPassword);
  await updatePlayers(config.DATA_DIR, (store) => {
    store.players[target.playerId] = { ...store.players[target.playerId]!, passwordHash: newHash };
    return store;
  });

  await auditLog(path.join(config.DATA_DIR, 'audit.jsonl'), {
    action: 'admin.password_reset',
    playerId: actor.playerId,
    targetId: target.playerId,
    data: { targetUsername },
  });

  return reply.status(204).send();
}
