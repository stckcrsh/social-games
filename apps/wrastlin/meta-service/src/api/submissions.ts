import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { loadState, loadSubmissions, saveSubmissions } from '../core/gameState.js';
import type { WeeklySubmission, ManagerAdvice, StoryRequest } from '@org/wrastlin-shared';

interface SubmitBody {
  managerId: string;
  advice: ManagerAdvice;
  storyRequests: StoryRequest[];
  wrestlerMessage?: string;
}

export async function submissionRoutes(app: FastifyInstance) {
  app.post<{ Body: SubmitBody }>('/submissions', async (req, reply) => {
    const state = loadState();
    if (state.phase !== 'week_open') {
      return reply.status(400).send({ error: 'Submissions are closed for this week' });
    }

    const { managerId, advice, storyRequests, wrestlerMessage } = req.body;
    const existing = loadSubmissions(state.currentWeek);

    if (existing.some(s => s.managerId === managerId)) {
      return reply.status(400).send({ error: 'Already submitted this week' });
    }

    const submission: WeeklySubmission = {
      submissionId: randomUUID(),
      managerId,
      week: state.currentWeek,
      advice,
      storyRequests,
      ...(wrestlerMessage ? { wrestlerMessage } : {}),
      submittedAt: new Date().toISOString(),
    };

    saveSubmissions(state.currentWeek, [...existing, submission]);
    return reply.status(201).send(submission);
  });

  app.get<{ Params: { week: string } }>('/submissions/week/:week', async (req) => {
    const week = parseInt(req.params.week, 10);
    return loadSubmissions(week);
  });
}
