import { test, expect, type APIRequestContext } from '@playwright/test';

const DEFAULT_PROFILE = {
  inventory: {},
  loadout: { slotA: 'hammer', slotB: null, activeSlot: 'A' },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createRun(request: APIRequestContext, preset: string, extra: Record<string, any> = {}) {
  const r = await request.post('/runs', {
    data: { preset, debug: true, profile: DEFAULT_PROFILE, ...extra },
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

// ─── fire_stress ──────────────────────────────────────────────────────────────

test.describe('fire_stress preset', () => {
  test('explosion ignites main pool but not disconnected island', async ({ request }) => {
    const { runId } = await createRun(request, 'fire_stress');

    // Explode at (4,4) radius 1 — hits main pool tiles
    const { turnEvents: ev } = await request
      .post(`/runs/${runId}/debug/explode`, { data: { x: 4, y: 4, radius: 1 } })
      .then(r => r.json());

    const types = ev.map((e: { type: string }) => e.type);
    expect(types).toContain('explosion');
    expect(types).toContain('oil_ignited');

    // Island tiles must NOT appear in oil_ignited events
    const islandPos = [{ x: 15, y: 7 }, { x: 16, y: 7 }, { x: 15, y: 8 }, { x: 16, y: 8 }];
    for (const p of islandPos) {
      expect(ev.some((e: { type: string; x?: number; y?: number }) =>
        e.type === 'oil_ignited' && e.x === p.x && e.y === p.y
      )).toBe(false);
    }

    // Wait 3 turns — fire spreads in main pool, never to island
    let totalSpread = 0;
    for (let i = 0; i < 3; i++) {
      const { turnEvents: te } = await tick(request, runId);
      totalSpread += te.filter((e: { type: string }) => e.type === 'fire_spread').length;
      for (const p of islandPos) {
        expect(te.some((e: { type: string; toX?: number; toY?: number; x?: number; y?: number }) =>
          (e.type === 'fire_spread' && e.toX === p.x && e.toY === p.y) ||
          (e.type === 'oil_ignited' && e.x === p.x && e.y === p.y)
        )).toBe(false);
      }
    }
    expect(totalSpread).toBeGreaterThan(0);
  });
});

// ─── mine_chain ───────────────────────────────────────────────────────────────

test.describe('mine_chain preset', () => {
  test('debug explosions destroy weak walls and corridor becomes walkable', async ({ request }) => {
    const { runId } = await createRun(request, 'mine_chain');

    // Destroy all three weak walls
    for (const [x, y] of [[7, 1], [9, 1], [11, 1]]) {
      const { state, turnEvents: ev } = await request
        .post(`/runs/${runId}/debug/explode`, { data: { x, y, radius: 1 } })
        .then(r => r.json());
      expect(ev.map((e: { type: string }) => e.type)).toContain('explosion');
      expect(ev.map((e: { type: string }) => e.type)).toContain('explosion_wall_destroyed');
      expect(state.grid[y][x].type).toBe('floor');
    }

    // Walk right from x=1 to x=18 (17 move E ticks)
    for (let step = 0; step < 17; step++) {
      const body = await tick(request, runId, { type: 'move', dir: 'E' });
      expect(body.error).toBeFalsy();
    }

    // Player must be at exit (18,1) and run extracted
    const { state } = await request.get(`/runs/${runId}`).then(r => r.json());
    expect(state.player.pos).toEqual({ x: 18, y: 1 });
    expect(state.status).toBe('extracted');
  });
});

// ─── ai_maze_regression ───────────────────────────────────────────────────────

test.describe('ai_maze_regression preset', () => {
  test('initial enemy positions match preset', async ({ request }) => {
    const { state } = await createRun(request, 'ai_maze_regression');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e1 = state.enemies.find((e: any) => e.id === 'enemy-1');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e3 = state.enemies.find((e: any) => e.id === 'enemy-3');
    expect(e1.pos).toEqual({ x: 18, y: 18 });
    expect(e3.pos).toEqual({ x: 18, y: 1 });
  });

  test('chase_astar approaches player over 6 turns', async ({ request }) => {
    const { state: init, runId } = await createRun(request, 'ai_maze_regression');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dist = (e: any) => Math.abs(e.pos.x - 1) + Math.abs(e.pos.y - 1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let prevDist = dist(init.enemies.find((e: any) => e.id === 'enemy-1'));
    let decreases = 0;

    for (let i = 0; i < 6; i++) {
      const { state } = await tick(request, runId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e1 = state.enemies.find((e: any) => e.id === 'enemy-1');
      if (e1) {
        const d = dist(e1);
        if (d < prevDist) decreases++;
        prevDist = d;
      }
    }
    expect(decreases).toBeGreaterThanOrEqual(2);
  });

  test('charger moves toward player within first 2 turns', async ({ request }) => {
    const { runId } = await createRun(request, 'ai_maze_regression');

    for (let i = 0; i < 2; i++) {
      const { state } = await tick(request, runId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const e3 = state.enemies.find((e: any) => e.id === 'enemy-3');
      if (e3 && e3.pos.x < 18) {
        return; // charger has moved — pass
      }
    }
    throw new Error('Charger did not move toward player within 2 turns');
  });
});
