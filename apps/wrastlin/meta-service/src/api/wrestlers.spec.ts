import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { wrestlerRoutes } from './wrestlers.js';
import * as gameState from '../core/gameState.js';
import * as wrestlerState from '../wrestlers/wrestlerState.js';

const mockWrestler = {
  wrestlerId: 'w-001',
  name: 'Rex Dominion',
  gimmick: 'The Arrogant Champion',
  stats: { strength: 80, agility: 60, endurance: 75, charisma: 70 },
  personality: { ego: 9, anger: 7, honor: 2, loyalty: 3, ambition: 8 },
  emotionalState: { confidence: 9, frustration: 2, fatigue: 3 },
  managerTrust: 4,
  finisher: 'Dominion Driver',
};

describe('wrestler routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /wrestlers', () => {
    it('returns 200 with an array of wrestlers', async () => {
      vi.spyOn(gameState, 'loadWrestlers').mockReturnValue([mockWrestler]);
      const app = Fastify();
      await app.register(wrestlerRoutes);

      const res = await app.inject({ method: 'GET', url: '/wrestlers' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].wrestlerId).toBe('w-001');
      await app.close();
    });
  });

  describe('GET /wrestlers/:id', () => {
    it('returns 200 with the wrestler when the id is valid', async () => {
      vi.spyOn(wrestlerState, 'getWrestler').mockReturnValue(mockWrestler);
      const app = Fastify();
      await app.register(wrestlerRoutes);

      const res = await app.inject({ method: 'GET', url: '/wrestlers/w-001' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.wrestlerId).toBe('w-001');
      expect(body.name).toBe('Rex Dominion');
      await app.close();
    });

    it('returns 404 with error message when the id is unknown', async () => {
      vi.spyOn(wrestlerState, 'getWrestler').mockReturnValue(undefined);
      const app = Fastify();
      await app.register(wrestlerRoutes);

      const res = await app.inject({ method: 'GET', url: '/wrestlers/unknown' });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Wrestler not found' });
      await app.close();
    });
  });
});
