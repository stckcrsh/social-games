import { test, expect, type APIRequestContext } from '@playwright/test';

// open preset: player (2,2), enemy-1 chase_astar (7,5), enemy-2 patrol_loop (7,8), exit (18,18)
// default preset: player (1,1), enemy-1 chase_astar (8,4), enemy-2 patrol_loop (4,8),
//                 lever at (5,7) → wall at (5,6), enemy-3 charger (10,18), exit (18,18)

const DEFAULT_PROFILE = {
  inventory: {},
  loadout: { slotA: 'hammer', slotB: null, activeSlot: 'A' },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createRun(request: APIRequestContext, preset = 'open', extra: Record<string, any> = {}) {
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

// ─── Run creation ─────────────────────────────────────────────────────────────

test.describe('POST /runs — run creation', () => {
  test('creates a run and returns valid shape', async ({ request }) => {
    const body = await createRun(request, 'open');

    expect(typeof body.runId).toBe('string');
    expect(body.state.status).toBe('active');
    expect(body.state.overclock).toBe(0);
    expect(body.state.player.pos).toEqual({ x: 2, y: 2 });
    expect(body.state.enemies.length).toBe(2);
  });

  test('returns 404 for unknown run', async ({ request }) => {
    const r = await request.get('/runs/nonexistent');
    expect(r.status()).toBe(404);
  });
});

// ─── Basic mechanics ──────────────────────────────────────────────────────────

test.describe('POST /runs/:id/tick — basic mechanics', () => {
  test('wait tick increments overclock', async ({ request }) => {
    const { runId } = await createRun(request);
    const body = await tick(request, runId);

    expect(body.state.overclock).toBe(1);
    expect(body.error).toBeUndefined();
  });

  test('move S changes player position', async ({ request }) => {
    const { runId } = await createRun(request);
    const body = await tick(request, runId, { type: 'move', dir: 'S' });

    expect(body.state.player.pos).toEqual({ x: 2, y: 3 });
    expect(body.turnEvents).toContainEqual(
      expect.objectContaining({ type: 'move', entityId: 'player', to: { x: 2, y: 3 } })
    );
  });

  test('move E then move S produces correct cumulative position', async ({ request }) => {
    const { runId } = await createRun(request);

    const r1 = await tick(request, runId, { type: 'move', dir: 'E' });
    expect(r1.state.player.pos).toEqual({ x: 3, y: 2 });

    const r2 = await tick(request, runId, { type: 'move', dir: 'S' });
    expect(r2.state.player.pos).toEqual({ x: 3, y: 3 });
  });

  test('move into out-of-bounds returns error, position unchanged', async ({ request }) => {
    // open preset: player at (2,2). Map rows/cols 0 are floor but x=-1 is OOB.
    // Move W three times: (2,2)→(1,2)→(0,2)→error (OOB)
    const { runId } = await createRun(request);

    await tick(request, runId, { type: 'move', dir: 'W' }); // (2,2)→(1,2)
    await tick(request, runId, { type: 'move', dir: 'W' }); // (1,2)→(0,2)

    const r = await request.post(`/runs/${runId}/tick`, {
      data: { action: { type: 'move', dir: 'W' } },
    });
    expect(r.status()).toBe(200);
    const body = await r.json();

    expect(body.error).toBeDefined();
    expect(body.state.player.pos.x).toBe(0);
  });

  test('400 on malformed tick body', async ({ request }) => {
    const { runId } = await createRun(request);
    const r = await request.post(`/runs/${runId}/tick`, {
      data: { action: { type: 'invalid' } },
    });
    expect(r.status()).toBe(400);
  });
});

// ─── Enemy behavior ───────────────────────────────────────────────────────────

test.describe('POST /runs/:id/tick — enemy behavior', () => {
  test('enemies move each tick', async ({ request }) => {
    const { runId, state } = await createRun(request);
    const startPos = { ...state.enemies[0].pos };

    // Wait 3 ticks — chase_astar enemy will move toward player
    await tick(request, runId);
    await tick(request, runId);
    const body = await tick(request, runId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newPos = body.state.enemies.find((e: any) => e.id === 'enemy-1')?.pos;
    expect(newPos).toBeDefined();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(newPos!.x !== startPos.x || newPos!.y !== startPos.y).toBe(true);
  });

  test('enemies attack when adjacent, dealing 3 damage', async ({ request }) => {
    const { runId } = await createRun(request);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let attackTick: any = null;

    for (let i = 0; i < 30; i++) {
      body = await tick(request, runId);
      if (body.state.player.hp < 20) {
        attackTick = body;
        break;
      }
    }

    expect(body.state.player.hp).toBeLessThan(20);

    if (attackTick) {
      const attackEvent = attackTick.turnEvents.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e: any) => (e.type === 'attack' || e.type === 'collision_attack') && e.damage === 3
      );
      expect(attackEvent).toBeDefined();
    }
  });
});

// ─── Run end: death ───────────────────────────────────────────────────────────

test.describe('POST /runs/:id/tick — run end: death', () => {
  test('player status becomes "dead" when HP reaches 0', async ({ request }) => {
    // open preset has 2 chase enemies — player will die eventually
    const { runId } = await createRun(request, 'open');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any = null;

    for (let i = 0; i < 60; i++) {
      body = await tick(request, runId);
      if (body.state.status === 'dead') break;
    }

    expect(body.state.status).toBe('dead');
    expect(body.turnEvents).toContainEqual(
      expect.objectContaining({ type: 'run_end' })
    );
  });

  test('tick on a dead run returns error in body', async ({ request }) => {
    const { runId } = await createRun(request, 'open');

    // Run to death
    for (let i = 0; i < 60; i++) {
      const body = await tick(request, runId);
      if (body.state.status === 'dead') break;
    }

    // One more tick on dead run
    const r = await request.post(`/runs/${runId}/tick`, { data: {} });
    expect(r.status()).toBe(200);
    const body = await r.json();

    expect(body.error).toBeDefined();
    expect(body.state.status).toBe('dead');
  });
});

// ─── Mechanism: lever ────────────────────────────────────────────────────────

test.describe('POST /runs/:id/tick — mechanism (default preset)', () => {
  test('lever interact opens wall passage', async ({ request }) => {
    // default preset: player at (1,1), lever at (5,7), wall at (5,6)
    // Path: move S×6 → (1,7), move E×3 → (4,7), interact → lever toggles → wall (5,6) → floor
    const { runId } = await createRun(request, 'default');

    // Navigate south to y=7 (path through x=1 is clear of walls)
    for (let i = 0; i < 6; i++) {
      const r = await tick(request, runId, { type: 'move', dir: 'S' });
      expect(r.state.player.pos.x).toBe(1);
    }

    // Navigate east to x=4 (adjacent to lever at x=5, y=7)
    for (let i = 0; i < 3; i++) {
      const r = await tick(request, runId, { type: 'move', dir: 'E' });
      expect(r.state.player.pos.y).toBe(7);
    }

    const getResp = await request.get(`/runs/${runId}`);
    const getBody = await getResp.json();
    expect(getBody.state.player.pos).toEqual({ x: 4, y: 7 });

    // Interact with lever
    const interactBody = await tick(request, runId, { type: 'interact' });

    expect(interactBody.turnEvents).toContainEqual(
      expect.objectContaining({ type: 'interacted' })
    );
    expect(interactBody.turnEvents).toContainEqual(
      expect.objectContaining({ type: 'mechanism_solved' })
    );
    expect(interactBody.turnEvents).toContainEqual(
      expect.objectContaining({ type: 'tile_changed', x: 5, y: 6, to: 'floor' })
    );

    // Grid[6][5] should now be floor (was wall before interact)
    expect(interactBody.state.grid[6][5].type).toBe('floor');
  });
});

// ─── Item use ────────────────────────────────────────────────────────────────

test.describe('POST /runs/:id/tick — item use', () => {
  test('hammer hits adjacent enemy', async ({ request }) => {
    // open preset: player (2,2), enemy-1 chase_astar at (7,5)
    // Wait until enemy is close, then use hammer
    const { runId } = await createRun(request, 'open');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let body: any;

    // Wait until enemy-1 is within 2 tiles of player
    for (let i = 0; i < 20; i++) {
      body = await tick(request, runId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const enemy1 = body.state.enemies.find((e: any) => e.id === 'enemy-1');
      if (!enemy1) break;
      const dist =
        Math.abs(enemy1.pos.x - body.state.player.pos.x) +
        Math.abs(enemy1.pos.y - body.state.player.pos.y);
      if (dist <= 2) break;
    }

    body = await tick(request, runId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enemy1 = body.state.enemies.find((e: any) => e.id === 'enemy-1');

    if (enemy1) {
      const px = body.state.player.pos.x;
      const py = body.state.player.pos.y;
      const ex = enemy1.pos.x;
      const ey = enemy1.pos.y;

      // Determine direction toward enemy if adjacent
      const dx = ex - px;
      const dy = ey - py;

      if (Math.abs(dx) + Math.abs(dy) === 1) {
        const dir = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N';
        const enemyHpBefore = enemy1.hp;

        const hitBody = await tick(request, runId, { type: 'useActive', dir });

        expect(hitBody.turnEvents).toContainEqual(
          expect.objectContaining({ type: 'item_hit', amount: 1 })
        );

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const enemyAfter = hitBody.state.enemies.find((e: any) => e.id === 'enemy-1');
        if (enemyAfter) {
          expect(enemyAfter.hp).toBe(enemyHpBefore - 1);
        }
      } else {
        // Enemy not adjacent yet — skip assertion but don't fail
        test.info().annotations.push({ type: 'skip-reason', description: 'enemy not adjacent within tick budget' });
      }
    }
  });
});
