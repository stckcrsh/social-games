import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { submissionRoutes } from './submissions.js';
import * as gameState from '../core/gameState.js';

const mockState = {
  currentWeek: 1,
  phase: 'week_open' as const,
  updatedAt: '2026-01-01T00:00:00Z',
};

const submitBody = {
  managerId: 'm-001',
  advice: { matchStyle: 'technical' },
  storyRequests: [],
};

describe('submission routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('POST /submissions', () => {
    it('returns 201 with the submission object when phase is week_open and no prior submission', async () => {
      vi.spyOn(gameState, 'loadState').mockReturnValue(mockState);
      vi.spyOn(gameState, 'loadSubmissions').mockReturnValue([]);
      vi.spyOn(gameState, 'saveSubmissions').mockImplementation(() => {});
      const app = Fastify();
      await app.register(submissionRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/submissions',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(submitBody),
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(typeof body.submissionId).toBe('string');
      expect(body.managerId).toBe('m-001');
      expect(body.week).toBe(1);
      await app.close();
    });

    it('includes wrestlerMessage in the submission when provided', async () => {
      vi.spyOn(gameState, 'loadState').mockReturnValue(mockState);
      vi.spyOn(gameState, 'loadSubmissions').mockReturnValue([]);
      vi.spyOn(gameState, 'saveSubmissions').mockImplementation(() => {});
      const app = Fastify();
      await app.register(submissionRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/submissions',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...submitBody, wrestlerMessage: 'Go get em champ!' }),
      });

      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body).wrestlerMessage).toBe('Go get em champ!');
      await app.close();
    });

    it('returns 400 when phase is submissions_closed', async () => {
      vi.spyOn(gameState, 'loadState').mockReturnValue({
        ...mockState,
        phase: 'submissions_closed',
      });
      const app = Fastify();
      await app.register(submissionRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/submissions',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(submitBody),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Submissions are closed for this week' });
      await app.close();
    });

    it('returns 400 when the manager already submitted this week', async () => {
      vi.spyOn(gameState, 'loadState').mockReturnValue(mockState);
      vi.spyOn(gameState, 'loadSubmissions').mockReturnValue([
        {
          submissionId: 'existing-uuid',
          managerId: 'm-001',
          week: 1,
          advice: { matchStyle: 'technical' as const },
          storyRequests: [],
          submittedAt: '2026-01-01T00:00:00Z',
        },
      ]);
      const app = Fastify();
      await app.register(submissionRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/submissions',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(submitBody),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Already submitted this week' });
      await app.close();
    });
  });

  describe('GET /submissions/week/:week', () => {
    it('returns 200 with an array of submissions for the given week', async () => {
      const mockSubmission = {
        submissionId: 'sub-001',
        managerId: 'm-001',
        week: 1,
        advice: { matchStyle: 'technical' as const },
        storyRequests: [],
        submittedAt: '2026-01-01T00:00:00Z',
      };
      vi.spyOn(gameState, 'loadSubmissions').mockReturnValue([mockSubmission]);
      const app = Fastify();
      await app.register(submissionRoutes);

      const res = await app.inject({ method: 'GET', url: '/submissions/week/1' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      expect(body[0].submissionId).toBe('sub-001');
      await app.close();
    });
  });
});
