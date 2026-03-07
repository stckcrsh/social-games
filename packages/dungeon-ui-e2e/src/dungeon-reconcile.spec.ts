import { test, expect, type APIRequestContext } from '@playwright/test';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createRun(request: APIRequestContext, preset = 'open', extra: Record<string, any> = {}) {
  const r = await request.post('/runs', {
    data: { preset, profile: { inventory: {}, loadout: { slotA: null, slotB: null, activeSlot: 'A' } }, ...extra },
  });
  expect(r.status()).toBe(201);
  return r.json();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function tick(request: APIRequestContext, runId: string, action?: Record<string, any>) {
  const r = await request.post(`/runs/${runId}/tick`, {
    data: action ? { action } : {},
  });
  expect(r.status()).toBe(200);
  return r.json();
}

test.describe('startReceipt', () => {
  test('receipt included on run creation', async ({ request }) => {
    const body = await createRun(request, 'open');
    expect(body.state.startReceipt).toBeDefined();
    expect(body.state.startReceipt.preset).toBe('open');
    expect(body.state.startReceipt.metaMode).toBe('bypass');
    expect(body.state.startReceipt.capacity.maxSlots).toBe(2);
  });

  test('GET /runs/:id/receipt returns receipt', async ({ request }) => {
    const { runId } = await createRun(request, 'open');
    const r = await request.get(`/runs/${runId}/receipt`);
    expect(r.status()).toBe(200);
    const receipt = await r.json();
    expect(receipt.runId).toBe(runId);
    expect(receipt.preset).toBe('open');
  });

  test('receipt reflects metaMode=strict when requested', async ({ request }) => {
    const body = await createRun(request, 'open', { metaMode: 'strict' });
    expect(body.state.startReceipt.metaMode).toBe('strict');
  });

  test('receipt stacks match inventory from profile', async ({ request }) => {
    const body = await createRun(request, 'open', {
      profile: {
        inventory: { ammo_rivet: 30 },
        loadout: { slotA: null, slotB: null, activeSlot: 'A' },
      },
    });
    expect(body.state.startReceipt.packed.stacks['ammo_rivet']).toEqual({ qty: 30 });
  });
});

test.describe('reconcile-patch and outbox', () => {
  test('patch generated when player dies, outbox record created', async ({ request }) => {
    const { runId } = await createRun(request, 'open');

    // Wait until dead (open preset has 2 chasers)
    for (let i = 0; i < 60; i++) {
      const body = await tick(request, runId);
      if (body.state.status === 'dead') break;
    }

    // Patch present on run state
    const runRes = await request.get(`/runs/${runId}`);
    const { state } = await runRes.json();
    expect(state.status).toBe('dead');
    expect(state.reconcilePatch).toBeDefined();
    expect(state.reconcilePatch.result).toBe('dead');

    // Dedicated patch endpoint
    const patchRes = await request.get(`/runs/${runId}/reconcile-patch`);
    expect(patchRes.status()).toBe(200);
    const patch = await patchRes.json();
    expect(patch.result).toBe('dead');
    expect(patch.runId).toBe(runId);

    // Outbox record exists
    const outboxRes = await request.get('/debug/reconcile-outbox');
    expect(outboxRes.status()).toBe(200);
    const outbox = await outboxRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record = outbox.find((r: any) => r.runId === runId);
    expect(record).toBeDefined();
    expect(record.status).toBe('pending');
  });

  test('retry in bypass mode returns skipped (no escrowId)', async ({ request }) => {
    const { runId } = await createRun(request, 'open');

    for (let i = 0; i < 60; i++) {
      const body = await tick(request, runId);
      if (body.state.status === 'dead') break;
    }

    const r = await request.post(`/debug/reconcile-outbox/${runId}/retry`);
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.status).toBe('skipped');
    expect(body.reason).toMatch(/bypass/i);
  });

  test('reconcile-patch 404 before run ends', async ({ request }) => {
    const { runId } = await createRun(request, 'open');
    const r = await request.get(`/runs/${runId}/reconcile-patch`);
    expect(r.status()).toBe(404);
  });
});
