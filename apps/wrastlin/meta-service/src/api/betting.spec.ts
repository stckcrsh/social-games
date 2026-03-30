import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { bettingRoutes } from './betting.js';
import * as persistence from '../betting/persistence.js';
import * as propositionService from '../betting/propositionService.js';
import * as entryService from '../betting/entryService.js';
import type { BettingState, BetProposition, BetEntry } from '@org/wrastlin-shared';

const openState: BettingState = {
  week: 7, phase: 'open', openedAt: '2026-03-28T10:00:00.000Z',
};

const sampleProposition: BetProposition = {
  propositionId: 'prop-1',
  week: 7,
  createdBy: 'm-001',
  statement: 'Steve loses to Vern',
  options: [
    { optionId: 'opt-a', label: 'Steve wins' },
    { optionId: 'opt-b', label: 'Steve loses' },
  ],
  createdAt: '2026-03-28T10:00:00.000Z',
};

const sampleEntry: BetEntry = {
  entryId: 'entry-1',
  propositionId: 'prop-1',
  bettorId: 'm-002',
  optionId: 'opt-a',
  amount: 50,
  placedAt: '2026-03-28T11:00:00.000Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('POST /bets/propositions', () => {
  it('creates proposition during open phase', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(openState);
    vi.spyOn(propositionService, 'createProposition').mockReturnValue(sampleProposition);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({
      method: 'POST',
      url: '/bets/propositions',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        managerId: 'm-001',
        statement: 'Steve loses to Vern',
        options: [{ label: 'Steve wins' }, { label: 'Steve loses' }],
      }),
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).propositionId).toBe('prop-1');
    await app.close();
  });

  it('returns 409 when betting window is not open', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(null);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({
      method: 'POST',
      url: '/bets/propositions',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        managerId: 'm-001',
        statement: 'Steve loses to Vern',
        options: [{ label: 'Steve wins' }, { label: 'Steve loses' }],
      }),
    });

    expect(res.statusCode).toBe(409);
    await app.close();
  });
});

describe('GET /bets/propositions', () => {
  it('returns propositions for current week', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(openState);
    vi.spyOn(propositionService, 'loadPropositions').mockReturnValue([sampleProposition]);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({ method: 'GET', url: '/bets/propositions' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveLength(1);
    await app.close();
  });

  it('returns 404 when no active betting window', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(null);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({ method: 'GET', url: '/bets/propositions' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('POST /bets/propositions/:id/entries', () => {
  it('places entry during open phase', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(openState);
    vi.spyOn(entryService, 'placeEntry').mockReturnValue(sampleEntry);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({
      method: 'POST',
      url: '/bets/propositions/prop-1/entries',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ managerId: 'm-002', optionId: 'opt-a', amount: 50 }),
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).entryId).toBe('entry-1');
    await app.close();
  });

  it('returns 409 when betting window is closed', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue({
      ...openState, phase: 'closed',
    });

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({
      method: 'POST',
      url: '/bets/propositions/prop-1/entries',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ managerId: 'm-002', optionId: 'opt-a', amount: 50 }),
    });

    expect(res.statusCode).toBe(409);
    await app.close();
  });
});

describe('GET /bets/entries', () => {
  it('returns entries filtered by bettorId', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(openState);
    vi.spyOn(entryService, 'loadEntries').mockReturnValue([sampleEntry]);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({
      method: 'GET',
      url: '/bets/entries?bettorId=m-002',
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveLength(1);
    await app.close();
  });
});

describe('GET /bets/state', () => {
  it('returns betting state when an active window exists', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(openState);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({ method: 'GET', url: '/bets/state' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ week: 7, phase: 'open' });
    await app.close();
  });

  it('returns 404 when no active betting window', async () => {
    vi.spyOn(persistence, 'loadBettingState').mockReturnValue(null);

    const app = Fastify();
    await app.register(bettingRoutes);

    const res = await app.inject({ method: 'GET', url: '/bets/state' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
