import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { managerRoutes } from './managers.js';
import * as managerService from '../managers/managerService.js';
import * as wrestlerState from '../wrestlers/wrestlerState.js';

const mockWrestler = {
  wrestlerId: 'w-001',
  name: 'Rex Dominion',
  gimmick: 'The Arrogant Champion',
  stats: { strength: 80, agility: 60, endurance: 75, charisma: 70 },
  personality: { ego: 9, anger: 7, honor: 2, loyalty: 3, ambition: 8 },
  emotionalState: { confidence: 9, frustration: 2, fatigue: 3 },
  relationships: [],
  memories: [],
  managerTrust: 4,
};

const mockManager = {
  managerId: 'm-001',
  wrestlerId: 'w-001',
  money: 1000,
  trustLevel: 'medium' as const,
};

describe('manager routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /managers/:id', () => {
    it('returns 200 with the manager when the id is valid', async () => {
      vi.spyOn(managerService, 'getManager').mockReturnValue(mockManager);
      const app = Fastify();
      await app.register(managerRoutes);

      const res = await app.inject({ method: 'GET', url: '/managers/m-001' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.managerId).toBe('m-001');
      expect(body.wrestlerId).toBe('w-001');
      await app.close();
    });

    it('returns 404 with error message when the id is unknown', async () => {
      vi.spyOn(managerService, 'getManager').mockReturnValue(undefined);
      const app = Fastify();
      await app.register(managerRoutes);

      const res = await app.inject({ method: 'GET', url: '/managers/unknown' });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Manager not found' });
      await app.close();
    });
  });

  describe('POST /managers/:id/chat', () => {
    it('returns 200 with wrestlerName and message strings for a valid manager', async () => {
      vi.spyOn(managerService, 'getManager').mockReturnValue(mockManager);
      vi.spyOn(wrestlerState, 'getWrestler').mockReturnValue(mockWrestler);
      const app = Fastify();
      await app.register(managerRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/managers/m-001/chat',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Go for the title!' }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(typeof body.wrestlerName).toBe('string');
      expect(typeof body.message).toBe('string');
      expect(body.wrestlerName).toBe('Rex Dominion');
      await app.close();
    });

    it('returns 404 when the manager is unknown', async () => {
      vi.spyOn(managerService, 'getManager').mockReturnValue(undefined);
      const app = Fastify();
      await app.register(managerRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/managers/unknown/chat',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'Hello?' }),
      });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Manager not found' });
      await app.close();
    });
  });
});
