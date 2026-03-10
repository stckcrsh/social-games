import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { betRoutes } from './bets.js';
import * as betService from '../bets/betService.js';
import * as gameState from '../core/gameState.js';
import type { BetProposition, BetEntry } from '@org/betting';

const mockState = {
  currentWeek: 1,
  phase: 'week_open' as const,
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockManager = {
  managerId: 'm-001',
  wrestlerId: 'w-001',
  money: 1000,
  trustLevel: 'medium' as const,
};

const openProposition: BetProposition = {
  propositionId: 'p-001',
  createdBy: 'm-001',
  question: 'Who wins the main event?',
  options: [
    { optionId: 'opt-a', label: 'Rex Dominion' },
    { optionId: 'opt-b', label: 'Steel Purity' },
  ],
  status: 'open',
  closesAt: '2099-01-01T00:00:00Z',
  eventKey: 1,
  createdAt: '2026-03-10T00:00:00Z',
};

const mockEntry: BetEntry = {
  entryId: 'e-001',
  propositionId: 'p-001',
  bettorId: 'm-001',
  optionId: 'opt-a',
  amount: 100,
  placedAt: '2026-03-10T01:00:00Z',
};

describe('bet routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ─── POST /bets/propositions ───────────────────────────────────────────────

  describe('POST /bets/propositions', () => {
    it('returns 201 with new proposition when phase is week_open and manager exists', async () => {
      vi.spyOn(gameState, 'loadState').mockReturnValue(mockState);
      vi.spyOn(gameState, 'loadManagers').mockReturnValue([mockManager]);
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([]);
      vi.spyOn(betService, 'savePropositions').mockImplementation(() => {});
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          createdBy: 'm-001',
          question: 'Who wins?',
          options: [{ optionId: 'opt-a', label: 'Rex' }],
          closesAt: '2099-01-01T00:00:00Z',
          eventKey: 1,
        }),
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(typeof body.propositionId).toBe('string');
      expect(body.status).toBe('open');
      expect(body.question).toBe('Who wins?');
      await app.close();
    });

    it('returns 400 when phase is not week_open', async () => {
      vi.spyOn(gameState, 'loadState').mockReturnValue({ ...mockState, phase: 'submissions_closed' });
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ createdBy: 'm-001', question: 'Who wins?', options: [], closesAt: '2099-01-01T00:00:00Z', eventKey: 1 }),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Propositions can only be created during week_open phase' });
      await app.close();
    });

    it('returns 404 when manager does not exist', async () => {
      vi.spyOn(gameState, 'loadState').mockReturnValue(mockState);
      vi.spyOn(gameState, 'loadManagers').mockReturnValue([]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ createdBy: 'unknown', question: 'Who wins?', options: [], closesAt: '2099-01-01T00:00:00Z', eventKey: 1 }),
      });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Manager not found' });
      await app.close();
    });
  });

  // ─── GET /bets/propositions ────────────────────────────────────────────────

  describe('GET /bets/propositions', () => {
    it('returns all propositions when no status filter', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([openProposition]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({ method: 'GET', url: '/bets/propositions' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body).toHaveLength(1);
      await app.close();
    });

    it('filters propositions by status query param', async () => {
      const closedProp = { ...openProposition, propositionId: 'p-002', status: 'closed' as const };
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([openProposition, closedProp]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({ method: 'GET', url: '/bets/propositions?status=open' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(1);
      expect(body[0].propositionId).toBe('p-001');
      await app.close();
    });
  });

  // ─── GET /bets/propositions/:id ───────────────────────────────────────────

  describe('GET /bets/propositions/:id', () => {
    it('returns 200 with proposition and pool summary', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([openProposition]);
      vi.spyOn(betService, 'loadEntries').mockReturnValue([mockEntry]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({ method: 'GET', url: '/bets/propositions/p-001' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.propositionId).toBe('p-001');
      expect(body.pool.totalPot).toBe(100);
      expect(body.pool.byOption['opt-a']).toBe(100);
      await app.close();
    });

    it('returns 404 when proposition does not exist', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({ method: 'GET', url: '/bets/propositions/unknown' });

      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({ error: 'Proposition not found' });
      await app.close();
    });
  });

  // ─── POST /bets/propositions/:id/entries ──────────────────────────────────

  describe('POST /bets/propositions/:id/entries', () => {
    it('returns 201 with entry, saves entry first, then deducts money', async () => {
      const callOrder: string[] = [];
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([openProposition]);
      vi.spyOn(gameState, 'loadState').mockReturnValue(mockState);
      vi.spyOn(gameState, 'loadManagers').mockReturnValue([mockManager]);
      vi.spyOn(betService, 'loadEntries').mockReturnValue([]);
      vi.spyOn(betService, 'saveEntries').mockImplementation(() => { callOrder.push('saveEntries'); });
      vi.spyOn(betService, 'deductMoney').mockImplementation(() => { callOrder.push('deductMoney'); });
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/p-001/entries',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bettorId: 'm-001', optionId: 'opt-a', amount: 100 }),
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.bettorId).toBe('m-001');
      expect(body.amount).toBe(100);
      // Entry must be saved BEFORE money is deducted
      expect(callOrder).toEqual(['saveEntries', 'deductMoney']);
      await app.close();
    });

    it('returns 404 when proposition does not exist', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/unknown/entries',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bettorId: 'm-001', optionId: 'opt-a', amount: 100 }),
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('returns 400 when proposition is not accepting bets (phase closed)', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([openProposition]);
      vi.spyOn(gameState, 'loadState').mockReturnValue({ ...mockState, phase: 'submissions_closed' });
      vi.spyOn(gameState, 'loadManagers').mockReturnValue([mockManager]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/p-001/entries',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bettorId: 'm-001', optionId: 'opt-a', amount: 100 }),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'This proposition is not accepting bets' });
      await app.close();
    });

    it('returns 400 when manager has insufficient funds', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([openProposition]);
      vi.spyOn(gameState, 'loadState').mockReturnValue(mockState);
      vi.spyOn(gameState, 'loadManagers').mockReturnValue([{ ...mockManager, money: 50 }]);
      vi.spyOn(betService, 'loadEntries').mockReturnValue([]);
      vi.spyOn(betService, 'deductMoney').mockImplementation(() => {});
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/p-001/entries',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bettorId: 'm-001', optionId: 'opt-a', amount: 100 }),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Insufficient funds' });
      await app.close();
    });
  });

  // ─── GET /bets/entries ────────────────────────────────────────────────────

  describe('GET /bets/entries', () => {
    it('returns entries for the given bettorId', async () => {
      const otherEntry = { ...mockEntry, entryId: 'e-002', bettorId: 'm-002' };
      vi.spyOn(betService, 'loadEntries').mockReturnValue([mockEntry, otherEntry]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({ method: 'GET', url: '/bets/entries?bettorId=m-001' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(1);
      expect(body[0].bettorId).toBe('m-001');
      await app.close();
    });

    it('returns all entries when no bettorId filter is given', async () => {
      const otherEntry = { ...mockEntry, entryId: 'e-002', bettorId: 'm-002' };
      vi.spyOn(betService, 'loadEntries').mockReturnValue([mockEntry, otherEntry]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({ method: 'GET', url: '/bets/entries' });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toHaveLength(2);
      await app.close();
    });
  });

  // ─── POST /bets/propositions/:id/resolve ─────────────────────────────────

  describe('POST /bets/propositions/:id/resolve', () => {
    it('returns 200 with payouts and marks proposition resolved', async () => {
      const propositionWithEntries = { ...openProposition };
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([propositionWithEntries]);
      vi.spyOn(betService, 'loadEntries').mockReturnValue([mockEntry]);
      vi.spyOn(betService, 'savePropositions').mockImplementation(() => {});
      vi.spyOn(betService, 'creditMoney').mockImplementation(() => {});
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/p-001/resolve',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ winningOptionIds: ['opt-a'] }),
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body.payouts)).toBe(true);
      expect(body.payouts[0].bettorId).toBe('m-001');
      expect(body.payouts[0].amount).toBe(100); // sole winner gets full pot
      await app.close();
    });

    it('returns 400 when proposition is already resolved', async () => {
      const resolved = { ...openProposition, status: 'resolved' as const };
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([resolved]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/p-001/resolve',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ winningOptionIds: ['opt-a'] }),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ error: 'Proposition is already resolved' });
      await app.close();
    });

    it('returns 404 when proposition does not exist', async () => {
      vi.spyOn(betService, 'loadPropositions').mockReturnValue([]);
      const app = Fastify();
      await app.register(betRoutes);

      const res = await app.inject({
        method: 'POST',
        url: '/bets/propositions/unknown/resolve',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ winningOptionIds: ['opt-a'] }),
      });

      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});
