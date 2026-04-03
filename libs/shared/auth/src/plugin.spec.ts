import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { buildAuthPlugin } from './plugin.js';

const TEST_JWT_SECRET = 'test-secret-at-least-16-chars!!';

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'org-auth-'));
  await writeFile(path.join(dir, 'players.json'), JSON.stringify({ players: {} }), 'utf8');
  return dir;
}

async function buildTestServer(dataDir: string): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });
  server.register(buildAuthPlugin({ dataDir, jwtSecret: TEST_JWT_SECRET, jwtExpiry: '1h' }));
  await server.ready();
  return server;
}

describe('buildAuthPlugin', () => {
  let dir: string;
  let server: FastifyInstance;

  beforeEach(async () => {
    dir = await makeTmpDir();
    server = await buildTestServer(dir);
  });

  afterEach(async () => {
    await server.close();
  });

  it('registers a new player and returns 201', async () => {
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

  it('logs in successfully and returns a JWT token', async () => {
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
    const body = JSON.parse(res.body) as { token: string; playerId: string; username: string };
    expect(body.token).toBeTruthy();
    expect(body.username).toBe('bob');
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

  it('returns 401 for unknown username', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'nobody', password: 'password123' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('blocks requests without a token on authenticate-protected routes', async () => {
    // /auth/logout uses onRequest: [server.authenticate]
    const unauthed = await server.inject({ method: 'POST', url: '/auth/logout' });
    expect(unauthed.statusCode).toBe(401);
  });

  it('allows requests with a valid token on authenticate-protected routes', async () => {
    await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'dave', password: 'password123' },
    });
    const loginRes = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'dave', password: 'password123' },
    });
    const { token } = JSON.parse(loginRes.body) as { token: string };

    const authed = await server.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(authed.statusCode).toBe(204);
  });

  it('changes password and allows login with new password', async () => {
    await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'eve', password: 'old-password1' },
    });
    const loginRes = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'eve', password: 'old-password1' },
    });
    const { token } = JSON.parse(loginRes.body) as { token: string };

    const changeRes = await server.inject({
      method: 'POST',
      url: '/auth/change-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { currentPassword: 'old-password1', newPassword: 'new-password1' },
    });
    expect(changeRes.statusCode).toBe(204);

    const newLogin = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'eve', password: 'new-password1' },
    });
    expect(newLogin.statusCode).toBe(200);
  });

  it('returns 403 for non-admin on admin reset', async () => {
    await server.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'frank', password: 'password123' },
    });
    const loginRes = await server.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'frank', password: 'password123' },
    });
    const { token } = JSON.parse(loginRes.body) as { token: string };

    const res = await server.inject({
      method: 'POST',
      url: '/auth/admin/reset-password',
      headers: { authorization: `Bearer ${token}` },
      payload: { targetUsername: 'frank', newPassword: 'new-pass-123' },
    });
    expect(res.statusCode).toBe(403);
  });
});
