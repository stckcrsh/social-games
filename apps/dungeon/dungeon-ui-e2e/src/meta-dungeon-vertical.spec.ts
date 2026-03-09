/**
 * Meta↔Dungeon vertical slice E2E tests.
 *
 * Proves the full cross-service loop in strict mode:
 *   escrow seed → run creation → run end (death or extraction)
 *   → reconcile patch → meta inventory update → idempotency
 *
 * Services must be running:
 *   META    = http://localhost:3000
 *   DUNGEON = http://localhost:3001
 */

import { test, expect, request as playwrightRequest } from '@playwright/test';
import { randomUUID } from 'crypto';

const META    = 'http://localhost:3000';
const DUNGEON = 'http://localhost:3001';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function registerAndLogin(username: string, password: string) {
  const ctx = await playwrightRequest.newContext();

  const regR = await ctx.post(`${META}/auth/register`, { data: { username, password } });
  expect(regR.status()).toBe(201);
  const { playerId } = await regR.json();

  const loginR = await ctx.post(`${META}/auth/login`, { data: { username, password } });
  expect(loginR.status()).toBe(200);
  const { token } = await loginR.json();

  await ctx.dispose();
  return { playerId, token };
}

async function seedInventory(
  escrowId: string,
  playerId: string,
  stacks: Record<string, number>,
) {
  const ctx = await playwrightRequest.newContext();
  const r = await ctx.post(`${META}/runs/escrows/${escrowId}/resolve`, {
    data: {
      runId: `setup-${escrowId}`,
      playerId,
      result: 'extracted',
      createdAt: Date.now(),
      consume: { instances: [], stacks: {} },
      grant: { instances: [], stacks },
      durabilityUpdates: [],
    },
  });
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.status).toBe('ok');
  await ctx.dispose();
}

async function getInventory(token: string) {
  const ctx = await playwrightRequest.newContext();
  const r = await ctx.get(`${META}/players/me/inventory`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(r.status()).toBe(200);
  const body = await r.json();
  await ctx.dispose();
  return body;
}

// ─── Death test ───────────────────────────────────────────────────────────────

test.describe('vertical slice — kill_room → death → reconcile idempotent', () => {
  test('meta escrow → kill_room → death → meta deducted, idempotency holds', async () => {
    // 1. Register + login
    const username = `vslice-death-${randomUUID().slice(0, 8)}`;
    const { playerId, token } = await registerAndLogin(username, 'pass1234');

    // 2. Seed 60 ammo_rivet via no-auth resolve
    const setupEscrowId = `setup-${randomUUID()}`;
    await seedInventory(setupEscrowId, playerId, { ammo_rivet: 60 });

    // 3. Verify inventory seeded
    const invBefore = await getInventory(token);
    expect(invBefore.stacks?.ammo_rivet).toBeGreaterThanOrEqual(60);

    // 4. Create a kill_room run with escrowId (pack 50 ammo_rivet)
    const escrowId = randomUUID();
    const ctx = await playwrightRequest.newContext();

    const createR = await ctx.post(`${DUNGEON}/runs`, {
      data: {
        preset: 'kill_room',
        debug: true,
        metaMode: 'strict',
        escrowId,
        playerId,
        profile: {
          inventory: { ammo_rivet: 50 },
          loadout: { slotA: null, slotB: null, activeSlot: 'A' },
        },
      },
    });
    expect(createR.status()).toBe(201);
    const { runId, state: createState } = await createR.json();
    expect(createState.status).toBe('active');

    // 5. Verify receipt
    const receiptR = await ctx.get(`${DUNGEON}/runs/${runId}/receipt`);
    expect(receiptR.status()).toBe(200);
    const receipt = await receiptR.json();
    expect(receipt.escrowId).toBe(escrowId);
    expect(receipt.packed.stacks.ammo_rivet.qty).toBe(50);
    expect(receipt.metaMode).toBe('strict');

    // 6. Tick once (no action — 8 adjacent enemies attack, player dies)
    const tickR = await ctx.post(`${DUNGEON}/runs/${runId}/tick`, { data: {} });
    expect(tickR.status()).toBe(200);
    const tickBody = await tickR.json();
    expect(tickBody.state.status).toBe('dead');

    // 7. Get reconcile patch
    const patchR = await ctx.get(`${DUNGEON}/runs/${runId}/reconcile-patch`);
    expect(patchR.status()).toBe(200);
    const patch = await patchR.json();
    expect(patch.result).toBe('dead');
    expect(patch.consume.stacks.ammo_rivet).toBe(50);

    // 8. Retry outbox → sends to meta
    const retryR = await ctx.post(`${DUNGEON}/debug/reconcile-outbox/${runId}/retry`, { data: {} });
    expect(retryR.status()).toBe(200);
    const retryBody = await retryR.json();
    expect(retryBody.status).toBe('sent');

    // 9. Verify inventory updated: 60 − 50 = 10
    const invAfter = await getInventory(token);
    expect(invAfter.stacks?.ammo_rivet ?? 0).toBe(10);

    // 10. Retry again (idempotency — meta deduplicates, dungeon records sent)
    const retry2R = await ctx.post(`${DUNGEON}/debug/reconcile-outbox/${runId}/retry`, { data: {} });
    expect(retry2R.status()).toBe(200);
    const retry2Body = await retry2R.json();
    expect(retry2Body.status).toBe('sent');

    // 11. Inventory must not be double-consumed
    const invFinal = await getInventory(token);
    expect(invFinal.stacks?.ammo_rivet ?? 0).toBe(10);

    await ctx.dispose();
  });
});

// ─── Extraction test ──────────────────────────────────────────────────────────

test.describe('vertical slice — exit_room → extracted → no consume', () => {
  test('meta escrow → exit_room → extracted → inventory unchanged', async () => {
    // 1. Register + login (fresh user)
    const username = `vslice-exit-${randomUUID().slice(0, 8)}`;
    const { playerId, token } = await registerAndLogin(username, 'pass1234');

    // 2. Seed 30 ammo_rivet
    const setupEscrowId = `setup-${randomUUID()}`;
    await seedInventory(setupEscrowId, playerId, { ammo_rivet: 30 });

    // 3. Create exit_room run with escrowId (pack 30 ammo_rivet)
    const escrowId = randomUUID();
    const ctx = await playwrightRequest.newContext();

    const createR = await ctx.post(`${DUNGEON}/runs`, {
      data: {
        preset: 'exit_room',
        debug: true,
        metaMode: 'strict',
        escrowId,
        playerId,
        profile: {
          inventory: { ammo_rivet: 30 },
          loadout: { slotA: null, slotB: null, activeSlot: 'A' },
        },
      },
    });
    expect(createR.status()).toBe(201);
    const { runId, state: createState } = await createR.json();
    expect(createState.status).toBe('active');

    // 4. Move East → player steps onto exit → extracted
    const tickR = await ctx.post(`${DUNGEON}/runs/${runId}/tick`, {
      data: { action: { type: 'move', dir: 'E' } },
    });
    expect(tickR.status()).toBe(200);
    const tickBody = await tickR.json();
    expect(tickBody.state.status).toBe('extracted');

    // 5. Get reconcile patch — extracted: no items consumed
    const patchR = await ctx.get(`${DUNGEON}/runs/${runId}/reconcile-patch`);
    expect(patchR.status()).toBe(200);
    const patch = await patchR.json();
    expect(patch.result).toBe('extracted');
    expect(patch.consume.stacks).toEqual({});

    // 6. Retry outbox
    const retryR = await ctx.post(`${DUNGEON}/debug/reconcile-outbox/${runId}/retry`, { data: {} });
    expect(retryR.status()).toBe(200);
    const retryBody = await retryR.json();
    expect(retryBody.status).toBe('sent');

    // 7. Inventory must be unchanged (extraction doesn't consume)
    const invAfter = await getInventory(token);
    expect(invAfter.stacks?.ammo_rivet ?? 0).toBe(30);

    await ctx.dispose();
  });
});
