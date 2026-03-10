import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { stateRoutes } from './state.js';
import * as weeklyOrchestrator from '../core/weeklyOrchestrator.js';

const mockState = {
  currentWeek: 1,
  phase: 'week_open' as const,
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('state routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /state', () => {
    it('returns 200 with the current state object', async () => {
      vi.spyOn(weeklyOrchestrator, 'getState').mockReturnValue(mockState);
      const app = Fastify();
      await app.register(stateRoutes);

      const res = await app.inject({ method: 'GET', url: '/state' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.currentWeek).toBe(1);
      expect(body.phase).toBe('week_open');
      await app.close();
    });
  });

  describe('POST /state/close-submissions', () => {
    it('returns 200 with updated state when phase transitions from week_open', async () => {
      const closedState = {
        currentWeek: 1,
        phase: 'submissions_closed' as const,
        updatedAt: '2026-01-01T01:00:00Z',
      };
      vi.spyOn(weeklyOrchestrator, 'transitionTo').mockReturnValue(closedState);
      const app = Fastify();
      await app.register(stateRoutes);

      const res = await app.inject({ method: 'POST', url: '/state/close-submissions' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.phase).toBe('submissions_closed');
      expect(body.currentWeek).toBe(1);
      await app.close();
    });

    it('returns 400 with error when the transition is invalid', async () => {
      vi.spyOn(weeklyOrchestrator, 'transitionTo').mockImplementation(() => {
        throw new Error('Invalid transition: submissions_closed → submissions_closed');
      });
      const app = Fastify();
      await app.register(stateRoutes);

      const res = await app.inject({ method: 'POST', url: '/state/close-submissions' });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(typeof body.error).toBe('string');
      expect(body.error).toMatch(/Invalid transition/);
      await app.close();
    });
  });

  describe('POST /state/advance-week', () => {
    it('returns 200 with updated state advancing the week when phase is show_generated', async () => {
      const nextWeekState = {
        currentWeek: 2,
        phase: 'week_open' as const,
        updatedAt: '2026-01-08T00:00:00Z',
      };
      vi.spyOn(weeklyOrchestrator, 'transitionTo').mockReturnValue(nextWeekState);
      const app = Fastify();
      await app.register(stateRoutes);

      const res = await app.inject({ method: 'POST', url: '/state/advance-week' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.phase).toBe('week_open');
      expect(body.currentWeek).toBe(2);
      await app.close();
    });

    it('returns 400 with error when the transition is invalid', async () => {
      vi.spyOn(weeklyOrchestrator, 'transitionTo').mockImplementation(() => {
        throw new Error('Invalid transition: week_open → week_open');
      });
      const app = Fastify();
      await app.register(stateRoutes);

      const res = await app.inject({ method: 'POST', url: '/state/advance-week' });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(typeof body.error).toBe('string');
      expect(body.error).toMatch(/Invalid transition/);
      await app.close();
    });
  });
});
