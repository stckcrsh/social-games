import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const DYNAMIC_DIR = '/tmp/wrastlin-e2e/runtime';

function resetRuntime() {
  const cleanState = {
    currentWeek: 1,
    phase: 'week_open',
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(DYNAMIC_DIR, 'state.json'),
    JSON.stringify(cleanState, null, 2)
  );
  fs.writeFileSync(
    path.join(DYNAMIC_DIR, 'bets', 'propositions.json'),
    JSON.stringify([], null, 2)
  );
  fs.writeFileSync(
    path.join(DYNAMIC_DIR, 'bets', 'entries.json'),
    JSON.stringify([], null, 2)
  );
  // Remove dynamic copies so the service reloads from static seed
  for (const file of ['managers.json', 'wrestlers.json']) {
    const dynPath = path.join(DYNAMIC_DIR, file);
    if (fs.existsSync(dynPath)) fs.unlinkSync(dynPath);
  }
}

const VALID_PROPOSITION = {
  createdBy: 'm-001',
  question: 'Who will win this match?',
  options: [
    { optionId: 'opt-rex', label: 'Rex Dominion' },
    { optionId: 'opt-steel', label: 'Steel Purity' },
  ],
  closesAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
  eventKey: 1,
};

// ─── Proposition creation ──────────────────────────────────────────────────────

test.describe('POST /bets/propositions', () => {
  test.beforeEach(() => resetRuntime());

  test('creates a proposition and returns 201 with status open', async ({ request }) => {
    const res = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('open');
    expect(typeof body.propositionId).toBe('string');
    expect(body.createdBy).toBe('m-001');
    expect(body.options).toHaveLength(2);
  });

  test('returns 400 when phase is submissions_closed', async ({ request }) => {
    // Close submissions first
    await request.post('/state/close-submissions');

    const res = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('week_open');
  });

  test('returns 404 when createdBy manager does not exist', async ({ request }) => {
    const res = await request.post('/bets/propositions', {
      data: { ...VALID_PROPOSITION, createdBy: 'nonexistent' },
    });
    expect(res.status()).toBe(404);
  });
});

// ─── Placing bets ─────────────────────────────────────────────────────────────

test.describe('POST /bets/propositions/:id/entries', () => {
  test.beforeEach(() => resetRuntime());

  test('places a bet and returns 201, money is reduced', async ({ request }) => {
    // Create proposition
    const propRes = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    const { propositionId } = await propRes.json();

    // Place bet
    const entryRes = await request.post(`/bets/propositions/${propositionId}/entries`, {
      data: { bettorId: 'm-001', optionId: 'opt-rex', amount: 100 },
    });
    expect(entryRes.status()).toBe(201);
    const entry = await entryRes.json();
    expect(entry.bettorId).toBe('m-001');
    expect(entry.amount).toBe(100);
    expect(typeof entry.entryId).toBe('string');

    // Verify money was deducted
    const mgr = await request.get('/managers/m-001');
    expect(mgr.status()).toBe(200);
    const mgrBody = await mgr.json();
    expect(mgrBody.money).toBe(900);
  });

  test('returns 400 when amount exceeds manager balance', async ({ request }) => {
    const propRes = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    const { propositionId } = await propRes.json();

    const res = await request.post(`/bets/propositions/${propositionId}/entries`, {
      data: { bettorId: 'm-001', optionId: 'opt-rex', amount: 9999 },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Insufficient funds');
  });

  test('returns 404 when proposition does not exist', async ({ request }) => {
    const res = await request.post('/bets/propositions/nonexistent/entries', {
      data: { bettorId: 'm-001', optionId: 'opt-rex', amount: 10 },
    });
    expect(res.status()).toBe(404);
  });
});

// ─── View entries ─────────────────────────────────────────────────────────────

test.describe('GET /bets/entries', () => {
  test.beforeEach(() => resetRuntime());

  test('returns entries filtered by bettorId', async ({ request }) => {
    const propRes = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    const { propositionId } = await propRes.json();
    await request.post(`/bets/propositions/${propositionId}/entries`, {
      data: { bettorId: 'm-001', optionId: 'opt-rex', amount: 50 },
    });

    const res = await request.get('/bets/entries?bettorId=m-001');
    expect(res.status()).toBe(200);
    const entries = await res.json();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries).toHaveLength(1);
    expect(entries[0].bettorId).toBe('m-001');
    expect(entries[0].amount).toBe(50);
  });
});

// ─── Full happy path ──────────────────────────────────────────────────────────

test.describe('Full betting lifecycle', () => {
  test.beforeEach(() => resetRuntime());

  test('create → bet → pool check → resolve → payout credited', async ({ request }) => {
    // 1. Create proposition
    const propRes = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    expect(propRes.status()).toBe(201);
    const { propositionId } = await propRes.json();

    // 2. Place bet (m-001 bets 100 on Rex)
    const entryRes = await request.post(`/bets/propositions/${propositionId}/entries`, {
      data: { bettorId: 'm-001', optionId: 'opt-rex', amount: 100 },
    });
    expect(entryRes.status()).toBe(201);

    // 3. Check pool
    const poolRes = await request.get(`/bets/propositions/${propositionId}`);
    expect(poolRes.status()).toBe(200);
    const poolBody = await poolRes.json();
    expect(poolBody.pool.totalPot).toBe(100);
    expect(poolBody.pool.byOption['opt-rex']).toBe(100);

    // 4. Resolve proposition (Rex wins)
    const resolveRes = await request.post(`/bets/propositions/${propositionId}/resolve`, {
      data: { winningOptionIds: ['opt-rex'] },
    });
    expect(resolveRes.status()).toBe(200);
    const resolveBody = await resolveRes.json();
    expect(resolveBody.proposition.status).toBe('resolved');
    expect(resolveBody.payouts).toHaveLength(1);
    expect(resolveBody.payouts[0].amount).toBe(100);

    // 5. Verify money restored (m-001 is sole bettor → receives 100% of pot)
    const mgrRes = await request.get('/managers/m-001');
    const mgrBody = await mgrRes.json();
    expect(mgrBody.money).toBe(1000); // 1000 - 100 + 100 = 1000
  });
});

// ─── Phase enforcement ────────────────────────────────────────────────────────

test.describe('Phase enforcement', () => {
  test.beforeEach(() => resetRuntime());

  test('bet is rejected when phase transitions to submissions_closed', async ({ request }) => {
    // 1. Create proposition while week_open
    const propRes = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    const { propositionId } = await propRes.json();

    // 2. Place first bet successfully
    const firstBet = await request.post(`/bets/propositions/${propositionId}/entries`, {
      data: { bettorId: 'm-001', optionId: 'opt-rex', amount: 10 },
    });
    expect(firstBet.status()).toBe(201);

    // 3. Close submissions
    const closeRes = await request.post('/state/close-submissions');
    expect(closeRes.status()).toBe(200);
    const state = await closeRes.json();
    expect(state.phase).toBe('submissions_closed');

    // 4. Attempt another bet — should be rejected
    const secondBet = await request.post(`/bets/propositions/${propositionId}/entries`, {
      data: { bettorId: 'm-001', optionId: 'opt-steel', amount: 10 },
    });
    expect(secondBet.status()).toBe(400);
    const body = await secondBet.json();
    expect(body.error).toContain('not accepting bets');
  });
});

// ─── Guard: resolve already-resolved proposition ──────────────────────────────

test.describe('Resolve guards', () => {
  test.beforeEach(() => resetRuntime());

  test('returns 400 when resolving an already-resolved proposition', async ({ request }) => {
    const propRes = await request.post('/bets/propositions', { data: VALID_PROPOSITION });
    const { propositionId } = await propRes.json();

    // Resolve once
    await request.post(`/bets/propositions/${propositionId}/resolve`, {
      data: { winningOptionIds: ['opt-rex'] },
    });

    // Resolve again
    const secondResolve = await request.post(`/bets/propositions/${propositionId}/resolve`, {
      data: { winningOptionIds: ['opt-rex'] },
    });
    expect(secondResolve.status()).toBe(400);
    const body = await secondResolve.json();
    expect(body.error).toContain('already resolved');
  });
});
