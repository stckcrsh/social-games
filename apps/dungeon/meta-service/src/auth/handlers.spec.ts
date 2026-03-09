import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import jwt from '@fastify/jwt';
import type { JwtPayload } from '@org/shared';
import { config } from '../config';
import { loadContent } from '../content/loader';
import { authRoutes } from './routes';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

const TEST_JWT_SECRET = 'test-secret-at-least-16-chars!!';
const SEED_DATA_DIR = path.resolve(__dirname, '../../data');

async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'mgs-auth-'));
}

async function buildTestServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  server.register(jwt, {
    secret: TEST_JWT_SECRET,
    sign: { expiresIn: '1h' },
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
  await server.ready();
  return server;
}

async function seedDataDir(dir: string): Promise<void> {
  await mkdir(path.join(dir, 'inventories'), { recursive: true });
  await writeFile(path.join(dir, 'players.json'), JSON.stringify({ players: {} }), 'utf8');
  await writeFile(path.join(dir, 'idempotency.json'), JSON.stringify({ records: {} }), 'utf8');
}

describe('auth handlers', () => {
  let dir: string;
  let server: FastifyInstance;
  let originalDataDir: string;
  let originalJwtSecret: string;

  beforeEach(async () => {
    dir = await makeTmpDir();
    await seedDataDir(dir);

    // Load content from seed data (idempotent)
    await loadContent(SEED_DATA_DIR);

    // Override config for tests
    originalDataDir = config.DATA_DIR;
    originalJwtSecret = config.JWT_SECRET;
    config.DATA_DIR = dir;
    config.JWT_SECRET = TEST_JWT_SECRET;

    server = await buildTestServer();
  });

  afterEach(async () => {
    config.DATA_DIR = originalDataDir;
    config.JWT_SECRET = originalJwtSecret;
    await server.close();
  });

  it('registers a new player', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'alice', password: 'password123' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { playerId: string; username: string };
    expect(body.username).toBe('alice');
    expect(body.playerId).toBeDefined();
  });

  it('returns 409 on duplicate username', async () => {
    await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'alice', password: 'password123' },
    });
    const res = await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'alice', password: 'other-pass' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('logs in successfully and returns token', async () => {
    await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'bob', password: 'password123' },
    });
    const res = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'bob', password: 'password123' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { token: string };
    expect(body.token).toBeTruthy();
  });

  it('returns 401 on wrong password', async () => {
    await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'carol', password: 'password123' },
    });
    const res = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'carol', password: 'wrong-pass' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('changes password successfully', async () => {
    await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'dave', password: 'old-password1' },
    });
    const loginRes = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'dave', password: 'old-password1' },
    });
    const { token } = JSON.parse(loginRes.body) as { token: string };

    const changeRes = await server.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'old-password1', newPassword: 'new-password1' },
    });
    expect(changeRes.statusCode).toBe(204);

    const newLoginRes = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'dave', password: 'new-password1' },
    });
    expect(newLoginRes.statusCode).toBe(200);
  });

  it('returns 403 for non-admin trying admin reset', async () => {
    await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'eve', password: 'password123' },
    });
    const loginRes = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'eve', password: 'password123' },
    });
    const { token } = JSON.parse(loginRes.body) as { token: string };

    const res = await server.inject({
      method: 'POST',
      url: '/auth/admin/reset-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { targetUsername: 'eve', newPassword: 'new-pass-123' },
    });
    expect(res.statusCode).toBe(403);
  });
});
