import type { FastifyInstance } from 'fastify';
import { loadBettingState } from '../betting/persistence.js';
import { createProposition, loadPropositions } from '../betting/propositionService.js';
import { placeEntry, loadEntries } from '../betting/entryService.js';

export async function bettingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/bets/propositions', async (req, reply) => {
    const state = loadBettingState();
    if (state?.phase !== 'open') {
      return reply.status(409).send({ error: 'Betting window is not open' });
    }

    const { managerId, statement, options } = req.body as {
      managerId: string;
      statement: string;
      options: { label: string }[];
    };

    const proposition = createProposition(state.week, managerId, statement, options);
    return reply.status(201).send(proposition);
  });

  app.get('/bets/propositions', async (req, reply) => {
    const state = loadBettingState();
    if (state === null) {
      return reply.status(404).send({ error: 'No active betting window' });
    }
    return reply.send(loadPropositions(state.week));
  });

  app.post<{ Params: { id: string } }>(
    '/bets/propositions/:id/entries',
    async (req, reply) => {
      const state = loadBettingState();
      if (state?.phase !== 'open') {
        return reply.status(409).send({ error: 'Betting window is not open' });
      }

      const { managerId, optionId, amount } = req.body as {
        managerId: string;
        optionId: string;
        amount: number;
      };

      try {
        const entry = placeEntry(state.week, req.params.id, managerId, optionId, amount);
        return reply.status(201).send(entry);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('Insufficient funds') || message.includes('not found')) {
          return reply.status(422).send({ error: message });
        }
        throw err;
      }
    },
  );

  app.get('/bets/entries', async (req, reply) => {
    const state = loadBettingState();
    if (state === null) {
      return reply.status(404).send({ error: 'No active betting window' });
    }

    const { bettorId } = req.query as { bettorId?: string };
    const entries = loadEntries(state.week);
    return reply.send(bettorId ? entries.filter(e => e.bettorId === bettorId) : entries);
  });
}
