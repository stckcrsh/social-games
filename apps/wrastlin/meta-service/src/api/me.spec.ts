import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';
import { buildAuthPlugin } from '@org/auth';
import * as gameState from '../core/gameState.js';
import { meRoute } from './me.js';

const TEST_JWT_SECRET = 'test-secret-at-least-16-chars!!';

async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'wrastlin-me-'));
  await writeFile(path.join(dir, 'players.json'), JSON.stringify({ players: {} }), 'utf8');
  return dir;
}

describe('GET /me', () => {
  let dir: string;
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.restoreAllMocks();
    dir = await makeTmpDir();
    app = Fastify({ logger: false });
    app.register(buildAuthPlugin({ dataDir: dir, jwtSecret: TEST_JWT_SECRET, jwtExpiry: '1h' }));
    app.register(meRoute);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 401 without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns manager and wrestler for the logged-in player', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'alice', password: 'password123' },
    });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'alice', password: 'password123' },
    });
    const { token, playerId } = JSON.parse(loginRes.body) as { token: string; playerId: string };

    const mockManager = {
      managerId: 'm-001',
      wrestlerId: 'w-001',
      money: 1000,
      trustLevel: 'medium' as const,
      playerId,
    };
    const mockWrestler = { wrestlerId: 'w-001', name: 'Iron Mike' };

    vi.spyOn(gameState, 'loadManagers').mockReturnValue([mockManager]);
    vi.spyOn(gameState, 'loadWrestlers').mockReturnValue([mockWrestler as never]);

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { manager: typeof mockManager; wrestler: typeof mockWrestler };
    expect(body.manager.managerId).toBe('m-001');
    expect(body.wrestler.wrestlerId).toBe('w-001');
  });

  it('returns 404 when no manager is linked to this player', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'bob', password: 'password123' },
    });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'bob', password: 'password123' },
    });
    const { token } = JSON.parse(loginRes.body) as { token: string };

    vi.spyOn(gameState, 'loadManagers').mockReturnValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
  });
});
