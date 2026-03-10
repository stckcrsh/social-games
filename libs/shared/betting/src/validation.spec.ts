import { describe, it, expect } from 'vitest';
import { isPropositionAcceptingBets } from './validation.js';
import type { BetProposition } from './types.js';

const future = '2099-01-01T00:00:00Z';
const past   = '2000-01-01T00:00:00Z';
const now    = '2026-03-10T12:00:00Z';

const open = (overrides: Partial<BetProposition> = {}): BetProposition => ({
  propositionId: 'p-001',
  createdBy: 'm-001',
  question: 'Who wins?',
  options: [],
  status: 'open',
  closesAt: future,
  eventKey: 1,
  createdAt: '2026-03-10T00:00:00Z',
  ...overrides,
});

describe('isPropositionAcceptingBets', () => {
  it('returns true when status is open, deadline is future, phase is week_open', () => {
    expect(isPropositionAcceptingBets(open(), now, 'week_open')).toBe(true);
  });

  it('returns false when status is closed', () => {
    expect(isPropositionAcceptingBets(open({ status: 'closed' }), now, 'week_open')).toBe(false);
  });

  it('returns false when status is resolved', () => {
    expect(isPropositionAcceptingBets(open({ status: 'resolved' }), now, 'week_open')).toBe(false);
  });

  it('returns false when closesAt is in the past', () => {
    expect(isPropositionAcceptingBets(open({ closesAt: past }), now, 'week_open')).toBe(false);
  });

  it('returns false when game phase is submissions_closed', () => {
    expect(isPropositionAcceptingBets(open(), now, 'submissions_closed')).toBe(false);
  });

  it('returns false when game phase is show_generated', () => {
    expect(isPropositionAcceptingBets(open(), now, 'show_generated')).toBe(false);
  });
});
