import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { loadState, loadManagers } from '../core/gameState.js';
import {
  loadPropositions, savePropositions,
  loadEntries, saveEntries,
  deductMoney, creditMoney,
} from '../bets/betService.js';
import {
  buildPool, calculatePayouts, isPropositionAcceptingBets,
} from '@org/betting';
import type { BetProposition, BetEntry } from '@org/betting';

interface CreatePropositionBody {
  createdBy: string;
  question: string;
  options: { optionId: string; label: string }[];
  closesAt: string;
  eventKey: string | number;
}

interface PlaceEntryBody {
  bettorId: string;
  optionId: string;
  amount: number;
}

interface ResolveBody {
  winningOptionIds: string[];
}

export async function betRoutes(app: FastifyInstance) {
  // POST /bets/propositions — create a proposition
  app.post<{ Body: CreatePropositionBody }>('/bets/propositions', async (req, reply) => {
    const state = loadState();
    if (state.phase !== 'week_open') {
      return reply.status(400).send({ error: 'Propositions can only be created during week_open phase' });
    }

    const managers = loadManagers();
    if (!managers.find(m => m.managerId === req.body.createdBy)) {
      return reply.status(404).send({ error: 'Manager not found' });
    }

    const proposition: BetProposition = {
      propositionId: randomUUID(),
      createdBy: req.body.createdBy,
      question: req.body.question,
      options: req.body.options,
      status: 'open',
      closesAt: req.body.closesAt,
      eventKey: req.body.eventKey,
      createdAt: new Date().toISOString(),
    };

    const existing = loadPropositions();
    savePropositions([...existing, proposition]);
    return reply.status(201).send(proposition);
  });

  // GET /bets/propositions — list propositions, optional ?status= filter
  app.get<{ Querystring: { status?: string } }>('/bets/propositions', async (req) => {
    const all = loadPropositions();
    const { status } = req.query;
    return status ? all.filter(p => p.status === status) : all;
  });

  // GET /bets/propositions/:id — get proposition + pool summary
  app.get<{ Params: { id: string } }>('/bets/propositions/:id', async (req, reply) => {
    const proposition = loadPropositions().find(p => p.propositionId === req.params.id);
    if (!proposition) return reply.status(404).send({ error: 'Proposition not found' });

    const entries = loadEntries().filter(e => e.propositionId === req.params.id);
    const pool = buildPool(entries);
    return { ...proposition, pool };
  });

  // POST /bets/propositions/:id/entries — place a bet
  app.post<{ Params: { id: string }; Body: PlaceEntryBody }>(
    '/bets/propositions/:id/entries',
    async (req, reply) => {
      const proposition = loadPropositions().find(p => p.propositionId === req.params.id);
      if (!proposition) return reply.status(404).send({ error: 'Proposition not found' });

      const state = loadState();
      const now = new Date().toISOString();
      if (!isPropositionAcceptingBets(proposition, now, state.phase)) {
        return reply.status(400).send({ error: 'This proposition is not accepting bets' });
      }

      const managers = loadManagers();
      const manager = managers.find(m => m.managerId === req.body.bettorId);
      if (!manager) return reply.status(404).send({ error: 'Manager not found' });
      if (manager.money < req.body.amount) {
        return reply.status(400).send({ error: 'Insufficient funds' });
      }

      const entry: BetEntry = {
        entryId: randomUUID(),
        propositionId: req.params.id,
        bettorId: req.body.bettorId,
        optionId: req.body.optionId,
        amount: req.body.amount,
        placedAt: now,
      };

      // Write entry FIRST, then deduct money (safer crash ordering)
      const existing = loadEntries();
      saveEntries([...existing, entry]);
      deductMoney(req.body.bettorId, req.body.amount);

      return reply.status(201).send(entry);
    }
  );

  // GET /bets/entries — list entries by bettorId
  app.get<{ Querystring: { bettorId?: string } }>('/bets/entries', async (req) => {
    const all = loadEntries();
    const { bettorId } = req.query;
    return bettorId ? all.filter(e => e.bettorId === bettorId) : all;
  });

  // POST /bets/propositions/:id/resolve — resolve a proposition and pay out winners
  app.post<{ Params: { id: string }; Body: ResolveBody }>(
    '/bets/propositions/:id/resolve',
    async (req, reply) => {
      const propositions = loadPropositions();
      const proposition = propositions.find(p => p.propositionId === req.params.id);
      if (!proposition) return reply.status(404).send({ error: 'Proposition not found' });
      if (proposition.status === 'resolved') {
        return reply.status(400).send({ error: 'Proposition is already resolved' });
      }

      const { winningOptionIds } = req.body;
      const entries = loadEntries().filter(e => e.propositionId === req.params.id);
      const pool = buildPool(entries);
      const payouts = calculatePayouts(pool, entries, winningOptionIds);

      for (const payout of payouts) {
        creditMoney(payout.bettorId, payout.amount);
      }

      const resolved: BetProposition = {
        ...proposition,
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        winningOptionIds,
      };
      savePropositions(propositions.map(p => p.propositionId === resolved.propositionId ? resolved : p));

      return { proposition: resolved, payouts };
    }
  );
}
