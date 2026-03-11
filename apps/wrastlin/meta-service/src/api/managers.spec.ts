import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { managerRoutes } from './managers.js';
import * as managerService from '../managers/managerService.js';

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
});
