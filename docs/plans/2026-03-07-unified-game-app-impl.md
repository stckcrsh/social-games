# Unified Game App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge `apps/meta-ui` and `apps/dungeon-ui` into a single React SPA at `apps/game`, add a loadout picker, post-run results page, dev-only debug route, pending run state with WS start action, and lazy TMX room loading.

**Architecture:** `apps/game` (port 4200) is a React 18 + Vite app with React Router v6. It routes all API calls through Caddy (`/api/meta/*` → meta-service, `/api/dungeon/*` → dungeon-service). The dungeon-service gains a `pending` run status so the client can navigate to `/game/:runId` before gameplay begins; a `start` WS message transitions it to `active`.

**Tech Stack:** pnpm, Nx 22, React 18, React Router v6, Vite, Fastify v5, Zod, Vitest, `@org/shared`, `@org/items`

---

## Context

**Current structure:**
- `apps/meta-ui` — React SPA at port 4200, base `/meta-ui/`, handles login/register/inventory/shop/trades/account/admin
- `apps/dungeon-ui` — React SPA at port 4201, handles the game canvas + lobby
- `packages/proxy/Caddyfile` — routes `/meta-ui/*` → 4200, catch-all → 4201
- `.claude/skills/dev/scripts/service.sh` — has `meta-ui:serve:4200` and `dungeon-ui:serve:4201`

**Key files to understand before starting:**
- `apps/meta-ui/src/App.tsx` — BrowserRouter, routes, `basename={import.meta.env.BASE_URL}`
- `apps/meta-ui/src/api/client.ts` — `apiFetch`, `authApi`, `inventoryApi`, etc. (calls `/api/meta/*`)
- `apps/meta-ui/src/auth/AuthContext.tsx` — JWT auth provider, localStorage token
- `apps/dungeon-ui/src/Game.tsx` — WS connection, game loop, `IsoRenderer`, HUD
- `apps/dungeon-ui/src/api.ts` — `createRun`, `stepTick`, `getReconcilePatch` (uses `VITE_DUNGEON_API_URL`)
- `apps/dungeon-service/src/api/ws.ts` — WS handler, `startTimer` called immediately on connect
- `apps/dungeon-service/src/api/schemas.ts` — `PlayerActionSchema` discriminated union
- `libs/shared/src/dungeon/types.ts` — `RunState.status: 'active' | 'dead' | 'extracted'` (needs `'pending'`)

---

## Task 1: Add `pending` status + WS `start` action to dungeon-service

**Goal:** `POST /runs` returns a run in `pending` status (unless debug/bypass). The WS handler waits for a `{ type: 'start' }` message before starting the tick timer. Debug/bypass runs remain `active` immediately.

**Files:**
- Modify: `libs/shared/src/dungeon/types.ts`
- Modify: `apps/dungeon-service/src/api/ws.ts`
- Modify: `apps/dungeon-service/src/api/routes.ts`
- Modify: `apps/dungeon-service/src/models/presets.ts`
- Test: `apps/dungeon-service/src/engine/turn.spec.ts` (guard: turn rejected when pending)

---

### Step 1: Write a failing test — `pending` run rejects game actions via HTTP

In `apps/dungeon-service/src/engine/turn.spec.ts`, add a test confirming that processTurn can still be called (it doesn't validate status — that's the HTTP route's job). Instead test the route-level guard in a route integration test.

Actually, processTurn doesn't check status — the HTTP `/runs/:id/action` route does (line 71-74 in routes.ts already guards `status !== 'active'`). We need to verify `pending` is included in that guard, and that `POST /runs` starts the run as `pending`.

Add to `apps/dungeon-service/src/engine/turn.spec.ts`:

```typescript
it('processTurn succeeds even if called on pending state (status guard is in route layer)', () => {
  const s = makeState();
  // Force pending status to verify processTurn itself doesn't reject it
  (s as RunState & { status: string }).status = 'pending';
  // processTurn should not throw — status guard lives in routes.ts
  const { state: s2 } = processTurn(s, { type: 'wait' });
  expect(s2).toBeDefined();
});
```

Run: `pnpm nx test dungeon-service --no-tui`
Expected: all existing tests pass (new test passes trivially — verifying guard is NOT in processTurn)

---

### Step 2: Add `'pending'` to `RunState.status` in shared types

In `libs/shared/src/dungeon/types.ts`, line 193:

```typescript
// Before:
status: 'active' | 'dead' | 'extracted';

// After:
status: 'pending' | 'active' | 'dead' | 'extracted';
```

Run: `pnpm nx run-many -t build --projects=dungeon-service,meta-service` (verify no type errors)

---

### Step 3: Set initial status to `pending` in `parsePreset`

In `apps/dungeon-service/src/models/presets.ts`, find where `state` is assembled (after grid/enemies/etc). Add:

```typescript
// Set status based on metaMode / debug flag
// parsePreset receives metaMode — if bypass or debug, start active; otherwise pending
```

The signature of `parsePreset` is: `parsePreset(preset, config, profile, metaMode, playerId, escrowId)`.

In `routes.ts` line 28-31:
```typescript
const { preset, config, profile, debug, metaMode, playerId, escrowId } = parseResult.data;
const state = parsePreset(preset, config, profile, metaMode, playerId, escrowId);
```

Update `parsePreset` to accept a `debug` flag too, OR set status in `routes.ts` after `parsePreset`.

**Simpler approach** — set status in `routes.ts` after `parsePreset`:

```typescript
// In routes.ts POST /runs handler:
const state = parsePreset(preset, config, profile, metaMode, playerId, escrowId);
if (!debug && metaMode !== 'bypass') {
  state.status = 'pending';
}
store.set(state);
if (debug) setDebugRun(state.id);
```

Note: `RunState` is a plain object (structuredClone'd in processTurn), so mutating before `store.set` is fine.

---

### Step 4: Gate `startTimer` behind `start` WS message

In `apps/dungeon-service/src/api/ws.ts`, change the WS handler:

**Before** (line 125-127):
```typescript
// Start timer only if not already running and not a debug run
if (!runTimers.has(id) && !debugRuns.has(id)) {
  startTimer(id, fastify);
}
```

**After:**
```typescript
// For active runs (debug/bypass), start timer immediately
// For pending runs, wait for { type: 'start' } WS message
const currentState = store.get(id);
if (currentState?.status === 'active' && !runTimers.has(id)) {
  startTimer(id, fastify);
}
```

**Also update the message handler** to handle `start`:

Before the `PlayerActionSchema.safeParse` block (line 132-137), add:

```typescript
// Check for 'start' message (transitions pending → active)
if (parsed.type === 'start') {
  const runState = store.get(id);
  if (runState?.status === 'pending') {
    runState.status = 'active';
    store.set(runState);
    if (!runTimers.has(id)) {
      startTimer(id, fastify);
    }
    broadcast(id, {
      state: runState,
      render: renderGrid(runState),
      slots: computeSlotView(runState.profile, runState.runItemState),
      turnEvents: [{ type: 'run_start' }],
    });
  }
  return;
}
```

Also add `'run_start'` to `GameEvent` in `libs/shared/src/dungeon/types.ts`:

```typescript
| { type: 'run_start' }
```

---

### Step 5: Run all dungeon-service tests

```bash
pnpm nx test dungeon-service --no-tui
```

Expected: all tests pass (39+).

---

### Step 6: Commit

```bash
git add libs/shared/src/dungeon/types.ts \
        apps/dungeon-service/src/api/ws.ts \
        apps/dungeon-service/src/api/routes.ts \
        apps/dungeon-service/src/engine/turn.spec.ts
git commit -m "feat(dungeon-service): add pending run status and WS start action"
```

---

## Task 2: Scaffold `apps/game` Nx React+Vite app

**Goal:** Create the new unified SPA at `apps/game`, port 4200, with React Router v6.

**Files:**
- Create: `apps/game/` (via Nx generator)
- Modify: `apps/game/vite.config.mts`
- Modify: `apps/game/src/main.tsx`

---

### Step 1: Generate the app

```bash
pnpm nx g @nx/react:application game \
  --directory=apps/game \
  --bundler=vite \
  --unitTestRunner=none \
  --e2eTestRunner=none \
  --style=css \
  --routing=true \
  --projectNameAndRootFormat=as-provided
```

If the generator prompts for style, choose `css`. If it asks about routing, choose yes.

---

### Step 2: Configure vite.config.mts

Replace the generated `apps/game/vite.config.mts` content with:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/game',
  server: {
    port: 4200,
    host: '0.0.0.0',
  },
  preview: {
    port: 4200,
    host: '0.0.0.0',
  },
  plugins: [react(), nxViteTsPaths()],
  build: {
    outDir: '../../dist/apps/game',
    reportCompressedSize: true,
    commonjsOptions: { transformMixedEsModules: true },
  },
});
```

Key points:
- Port 4200 (replaces meta-ui)
- `host: '0.0.0.0'` required on macOS (IPv6 vs IPv4 issue)
- No `base` path (unlike meta-ui which had `/meta-ui/`)

---

### Step 3: Install react-router-dom

```bash
pnpm add react-router-dom --filter @org/game
```

Note: use `@org/game` or whatever the package name is in the generated `package.json`. If the package isn't named that, use the workspace package name from `apps/game/package.json`.

---

### Step 4: Verify the app starts

```bash
pnpm nx serve game
```

Visit http://localhost:4200 — should show the default Nx welcome page.

Stop the server (Ctrl+C).

---

### Step 5: Commit

```bash
git add apps/game/
git commit -m "feat: scaffold apps/game as unified React+Vite SPA"
```

---

## Task 3: Set up shared infrastructure in apps/game

**Goal:** Auth context, API client (meta-service + dungeon-service), React Router shell with Header nav.

**Files:**
- Create: `apps/game/src/auth/AuthContext.tsx`
- Create: `apps/game/src/api/meta.ts`
- Create: `apps/game/src/api/dungeon.ts`
- Create: `apps/game/src/components/Header.tsx`
- Create: `apps/game/src/components/RequireAuth.tsx`
- Create: `apps/game/src/components/RequireAdmin.tsx`
- Modify: `apps/game/src/main.tsx`
- Modify: `apps/game/src/App.tsx`
- Create: `apps/game/src/styles/global.css`

---

### Step 1: Copy auth context from meta-ui

Copy `apps/meta-ui/src/auth/AuthContext.tsx` to `apps/game/src/auth/AuthContext.tsx`.

The content is identical — JWT auth provider that stores token in localStorage, exposes `user`, `token`, `login`, `logout`. No changes needed.

---

### Step 2: Create meta-service API client

Create `apps/game/src/api/meta.ts`:

```typescript
// API calls to meta-service via Caddy (/api/meta/*)

const BASE = '/api/meta';

async function apiFetch(path: string, options?: RequestInit, token?: string | null): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...options, headers: { ...headers, ...options?.headers } });
  return res;
}

// Re-export the full API surface from meta-ui's client.ts
// (copy the authApi, inventoryApi, contentApi, shopApi, tradesApi objects here)
```

**Full implementation** — copy `apps/meta-ui/src/api/client.ts` to `apps/game/src/api/meta.ts` and change:
- Remove the `import.meta.env.VITE_META_API_URL` — hardcode `BASE = '/api/meta'`
- Keep all exported objects: `authApi`, `inventoryApi`, `contentApi`, `shopApi`, `tradesApi`

---

### Step 3: Create dungeon-service API client

Create `apps/game/src/api/dungeon.ts`:

```typescript
import type { RunState, SlotView, ReconcilePatch } from '@org/shared';

const BASE = import.meta.env.DEV
  ? (import.meta.env.VITE_DUNGEON_API_URL ?? 'http://localhost:8080/api/dungeon')
  : '/api/dungeon';

export async function createRun(opts: {
  preset: string;
  profile?: object;
  debug?: boolean;
  playerId?: string;
  metaMode?: 'bypass' | 'strict';
  escrowId?: string;
}): Promise<{ runId: string; state: RunState; render: string; slots?: SlotView; debug?: boolean }> {
  const res = await fetch(`${BASE}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getReconcilePatch(runId: string): Promise<ReconcilePatch> {
  const res = await fetch(`${BASE}/runs/${runId}/reconcile-patch`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function stepTick(
  runId: string,
  action?: object,
): Promise<{ state: RunState; render: string; slots?: SlotView; turnEvents: unknown[]; error?: string }> {
  const res = await fetch(`${BASE}/runs/${runId}/tick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action ? { action } : {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function getWsUrl(runId: string): string {
  const base = import.meta.env.DEV
    ? (import.meta.env.VITE_DUNGEON_WS_URL ?? 'ws://localhost:8080/api/dungeon')
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/dungeon`;
  return `${base}/runs/${runId}/ws`;
}
```

---

### Step 4: Set up main.tsx and App.tsx with React Router

`apps/game/src/main.tsx`:
```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { App } from './App';
import './styles/global.css';

const root = document.getElementById('root');
if (!root) throw new Error('No root element found');
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
```

`apps/game/src/App.tsx` (shell with routes — routes added in later tasks):
```typescript
import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { RequireAuth } from './components/RequireAuth';

export function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/inventory" replace />} />
        {/* Routes added in Tasks 4-8 */}
      </Routes>
    </>
  );
}
```

---

### Step 5: Copy Header and auth guards from meta-ui

Copy these files, adjusting imports (`../auth/AuthContext` not `../../auth/...`):
- `apps/meta-ui/src/components/Header.tsx` → `apps/game/src/components/Header.tsx`
  - Update nav links: `/inventory`, `/shop`, `/trades`, `/account`, `/admin`, `/debug` (dev only)
- `apps/meta-ui/src/auth/RequireAuth.tsx` → `apps/game/src/components/RequireAuth.tsx`
- `apps/meta-ui/src/auth/RequireAdmin.tsx` → `apps/game/src/components/RequireAdmin.tsx`

---

### Step 6: Copy global CSS

Copy `apps/meta-ui/src/styles/global.css` → `apps/game/src/styles/global.css`. Adjust font/body styles if needed (keep existing).

---

### Step 7: Commit

```bash
git add apps/game/src/
git commit -m "feat(game): add auth context, API clients, and routing shell"
```

---

## Task 4: Migrate meta-ui pages into apps/game

**Goal:** Port all existing meta-ui pages (Login, Register, Inventory, Shop, Trades, Account, Admin) into `apps/game/src/pages/` and wire them into the router.

**Files:**
- Create: `apps/game/src/pages/` (7 pages)
- Modify: `apps/game/src/App.tsx`

---

### Step 1: Copy and adapt each page

For each page file in `apps/meta-ui/src/pages/`, copy to `apps/game/src/pages/` and update:
1. Import paths: `../api/client` → `../api/meta` (or `../../api/meta` depending on depth)
2. Import paths: `../auth/AuthContext` → `../auth/AuthContext`
3. Remove any `DUNGEON_UI_URL` usage (the "Play Dungeon Run" button now navigates to `/loadout`)

Pages to copy:
- `LoginPage.tsx` — no API path changes needed; on success, navigate to `/inventory`
- `RegisterPage.tsx` — same
- `InventoryPage.tsx` — **change the "Play Dungeon Run" link/button to `<Link to="/loadout">`** instead of linking to the external dungeon-ui URL
- `ShopPage.tsx` — update import paths
- `TradesPage.tsx` — update import paths
- `AccountPage.tsx` — update import paths
- `AdminPage.tsx` — update import paths

Also copy any sub-components used by pages:
- `apps/meta-ui/src/components/ErrorMessage.tsx` → `apps/game/src/components/ErrorMessage.tsx`
- `apps/meta-ui/src/components/LoadingSpinner.tsx` → `apps/game/src/components/LoadingSpinner.tsx`
- `apps/meta-ui/src/components/RawResponse.tsx` → `apps/game/src/components/RawResponse.tsx`
- `apps/meta-ui/src/pages/ItemDefDetailPage.tsx` → copy (used by ItemDefsPage)
- `apps/meta-ui/src/pages/ItemDefsPage.tsx` → copy

---

### Step 2: Wire pages into App.tsx router

```typescript
// apps/game/src/App.tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { Header } from './components/Header';
import { RequireAuth } from './components/RequireAuth';
import { RequireAdmin } from './components/RequireAdmin';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { InventoryPage } from './pages/InventoryPage';
import { ShopPage } from './pages/ShopPage';
import { TradesPage } from './pages/TradesPage';
import { AccountPage } from './pages/AccountPage';
import { AdminPage } from './pages/AdminPage';

export function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Navigate to="/inventory" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/inventory" element={<RequireAuth><InventoryPage /></RequireAuth>} />
        <Route path="/shop" element={<RequireAuth><ShopPage /></RequireAuth>} />
        <Route path="/trades" element={<RequireAuth><TradesPage /></RequireAuth>} />
        <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
        <Route path="/admin" element={<RequireAdmin><AdminPage /></RequireAdmin>} />
        {/* /loadout, /game/:runId, /results/:runId, /debug added in later tasks */}
      </Routes>
    </>
  );
}
```

---

### Step 3: Verify it builds

```bash
pnpm nx build game
```

Fix any TypeScript errors (usually import path issues).

---

### Step 4: Commit

```bash
git add apps/game/src/pages/ apps/game/src/components/ apps/game/src/App.tsx
git commit -m "feat(game): migrate meta-ui pages into unified app"
```

---

## Task 5: Migrate dungeon-ui Game component into apps/game

**Goal:** Port `Game.tsx`, `IsoRenderer.tsx`, `tileset.ts` from dungeon-ui. Update `Game.tsx` to:
1. Handle `pending` status (show Ready screen with Start button that sends `{ type: 'start' }` over WS)
2. On `dead`/`extracted`, navigate to `/results/:runId` instead of showing inline summary
3. Use the new WS URL from `apps/game/src/api/dungeon.ts` (`getWsUrl`)

**Files:**
- Create: `apps/game/src/game/IsoRenderer.tsx`
- Create: `apps/game/src/game/tileset.ts`
- Create: `apps/game/src/game/Game.tsx`
- Modify: `apps/game/src/App.tsx`

---

### Step 1: Copy IsoRenderer and tileset

Copy with no functional changes (only fix import paths):
- `apps/dungeon-ui/src/IsoRenderer.tsx` → `apps/game/src/game/IsoRenderer.tsx`
- `apps/dungeon-ui/src/tileset.ts` → `apps/game/src/game/tileset.ts`

These use `@org/shared` which is available via path alias. No other changes.

---

### Step 2: Copy and adapt Game.tsx

Copy `apps/dungeon-ui/src/Game.tsx` → `apps/game/src/game/Game.tsx`.

**Changes to make:**

1. **WS URL**: Replace hardcoded `ws://localhost:3001/runs/${runId}/ws` with:
   ```typescript
   import { getWsUrl, stepTick } from '../api/dungeon';
   // ...
   const ws = new WebSocket(getWsUrl(runId));
   ```

2. **Handle `pending` status**: When `state.status === 'pending'`, show a Ready screen instead of the game canvas:

   ```tsx
   if (state.status === 'pending') {
     return (
       <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}>
         <h2>Ready to Start</h2>
         <p>Loadout prepared. Click Start when ready.</p>
         <button
           onClick={() => ws.current?.send(JSON.stringify({ type: 'start' }))}
           style={{ padding: '12px 32px', fontSize: 18, marginTop: 24, cursor: 'pointer' }}
         >
           Start Run
         </button>
       </div>
     );
   }
   ```

   Keep `ws.current` accessible by storing the WS instance in a ref rather than a local variable.

3. **Navigate to results on run end**: Replace the inline "END" screen with a navigation:

   ```typescript
   import { useNavigate } from 'react-router-dom';
   // ...
   const navigate = useNavigate();
   // ...
   // In useEffect where status changes:
   if (msg.state.status === 'dead' || msg.state.status === 'extracted') {
     navigate(`/results/${runId}`);
   }
   ```

   Remove the existing end-state JSX that shows reconcilePatch inline.

4. **Props**: `Game.tsx` receives `runId: string` as a prop (from URL params in the route). Replace any `preset` prop usage. Use `useParams` from react-router-dom:

   ```typescript
   import { useParams, useNavigate } from 'react-router-dom';

   export function GamePage() {
     const { runId } = useParams<{ runId: string }>();
     const navigate = useNavigate();
     // ...
   }
   ```

---

### Step 3: Add GamePage route to App.tsx

```typescript
import { GamePage } from './game/Game';
// In <Routes>:
<Route path="/game/:runId" element={<RequireAuth><GamePage /></RequireAuth>} />
```

---

### Step 4: Copy tile assets

The game renders an isometric canvas using tiles from `dungeon-ui/public/tiles/`. These need to be in `apps/game/public/tiles/`.

```bash
cp -r apps/dungeon-ui/public/tiles/ apps/game/public/tiles/
```

---

### Step 5: Verify build

```bash
pnpm nx build game
```

---

### Step 6: Commit

```bash
git add apps/game/src/game/ apps/game/public/tiles/ apps/game/src/App.tsx
git commit -m "feat(game): migrate game canvas components with pending status support"
```

---

## Task 6: Add /loadout page

**Goal:** A page that fetches the player's owned inventory from meta-service and lets them pick slot A, slot B, and ammo quantity. On confirm, calls `POST /runs` to dungeon-service with `escrowId`, then navigates to `/game/:runId`.

**Files:**
- Create: `apps/game/src/pages/LoadoutPage.tsx`
- Modify: `apps/game/src/App.tsx`

---

### Step 1: Create LoadoutPage.tsx

```tsx
// apps/game/src/pages/LoadoutPage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { inventoryApi } from '../api/meta';
import { createRun } from '../api/dungeon';
import type { MetaItemDef } from '@org/shared';

export function LoadoutPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();

  const [inventory, setInventory] = useState<{ itemId: string; qty: number; def: MetaItemDef }[]>([]);
  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [ammoQty, setAmmoQty] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    inventoryApi.getInventory(token).then((data) => {
      // data = array of { itemId, qty, def } — check actual shape from meta-service
      setInventory(data);
    }).catch((e) => setError(e.message));
  }, [token]);

  async function handleStart() {
    setLoading(true);
    setError(null);
    try {
      // Create an escrow via meta-service, then create a run
      // Step 1: POST /api/meta/runs/escrows — not yet implemented; for now, use bypass
      // TODO: integrate escrow creation once meta-service has the endpoint
      const { runId } = await createRun({
        preset: 'open',
        profile: {
          inventory: Object.fromEntries(inventory.map(i => [i.itemId, i.qty])),
          loadout: { slotA, slotB, activeSlot: 'A' },
        },
        metaMode: 'strict',
        playerId: user?.sub,
      });
      navigate(`/game/${runId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start run');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 16px' }}>
      <h1>Choose Loadout</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <section>
        <h2>Slot A</h2>
        <select value={slotA ?? ''} onChange={(e) => setSlotA(e.target.value || null)}>
          <option value="">— None —</option>
          {inventory.map((item) => (
            <option key={item.itemId} value={item.itemId}>{item.def?.name ?? item.itemId}</option>
          ))}
        </select>
      </section>

      <section>
        <h2>Slot B</h2>
        <select value={slotB ?? ''} onChange={(e) => setSlotB(e.target.value || null)}>
          <option value="">— None —</option>
          {inventory.map((item) => (
            <option key={item.itemId} value={item.itemId}>{item.def?.name ?? item.itemId}</option>
          ))}
        </select>
      </section>

      <section>
        <h2>Ammo</h2>
        <input
          type="number"
          min={0}
          max={99}
          value={ammoQty}
          onChange={(e) => setAmmoQty(Number(e.target.value))}
        />
      </section>

      <button
        onClick={handleStart}
        disabled={loading}
        style={{ marginTop: 24, padding: '12px 32px', fontSize: 18, cursor: 'pointer' }}
      >
        {loading ? 'Starting...' : 'Confirm & Enter Run'}
      </button>
    </div>
  );
}
```

**Note:** The escrow flow (locking items in meta-service before creating the run) requires a meta-service endpoint not yet built. For now, the loadout page creates a run with `metaMode: 'strict'` and passes the profile directly. Items escrow integration can be added in a future task.

---

### Step 2: Add route in App.tsx

```tsx
import { LoadoutPage } from './pages/LoadoutPage';
// In <Routes>:
<Route path="/loadout" element={<RequireAuth><LoadoutPage /></RequireAuth>} />
```

---

### Step 3: Commit

```bash
git add apps/game/src/pages/LoadoutPage.tsx apps/game/src/App.tsx
git commit -m "feat(game): add /loadout page for run configuration"
```

---

## Task 7: Add /results/:runId page

**Goal:** Post-run summary page. Fetches reconcile patch from dungeon-service, shows result badge, items lost/found, and a button back to `/inventory`.

**Files:**
- Create: `apps/game/src/pages/ResultsPage.tsx`
- Modify: `apps/game/src/App.tsx`

---

### Step 1: Create ResultsPage.tsx

```tsx
// apps/game/src/pages/ResultsPage.tsx
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getReconcilePatch } from '../api/dungeon';
import type { ReconcilePatch } from '@org/shared';

export function ResultsPage() {
  const { runId } = useParams<{ runId: string }>();
  const [patch, setPatch] = useState<ReconcilePatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    // Retry a few times — patch may take a moment to compute
    let attempts = 0;
    const tryFetch = async () => {
      try {
        const p = await getReconcilePatch(runId);
        setPatch(p);
      } catch (e) {
        if (attempts < 5) {
          attempts++;
          setTimeout(tryFetch, 1000);
        } else {
          setError(e instanceof Error ? e.message : 'Failed to load results');
        }
      }
    };
    tryFetch();
  }, [runId]);

  if (error) return <div style={{ padding: 32 }}><p style={{ color: 'red' }}>{error}</p></div>;
  if (!patch) return <div style={{ padding: 32 }}>Loading results...</div>;

  const won = patch.result === 'extracted';

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 16px' }}>
      <h1 style={{ color: won ? '#22cc88' : '#cc2244' }}>
        {won ? '✓ Extracted' : '✗ Dead'}
      </h1>

      <section>
        <h2>Items Lost</h2>
        {patch.consume.instances.length === 0 && Object.keys(patch.consume.stacks).length === 0
          ? <p>None</p>
          : (
            <ul>
              {patch.consume.instances.map((id) => <li key={id}>{id}</li>)}
              {Object.entries(patch.consume.stacks).map(([itemId, qty]) => (
                <li key={itemId}>{itemId} ×{qty}</li>
              ))}
            </ul>
          )
        }
      </section>

      <section>
        <h2>Items Found</h2>
        {patch.grant.instances.length === 0 && Object.keys(patch.grant.stacks).length === 0
          ? <p>None</p>
          : (
            <ul>
              {patch.grant.instances.map((item, i) => (
                <li key={i}>{item.defId}{item.qty ? ` ×${item.qty}` : ''}</li>
              ))}
              {Object.entries(patch.grant.stacks).map(([itemId, qty]) => (
                <li key={itemId}>{itemId} ×{qty}</li>
              ))}
            </ul>
          )
        }
      </section>

      <Link to="/inventory">
        <button style={{ marginTop: 32, padding: '12px 32px', fontSize: 18, cursor: 'pointer' }}>
          Back to Inventory
        </button>
      </Link>
    </div>
  );
}
```

---

### Step 2: Add route in App.tsx

```tsx
import { ResultsPage } from './pages/ResultsPage';
// In <Routes>:
<Route path="/results/:runId" element={<ResultsPage />} />
```

(No RequireAuth — the page only uses the runId, which is a public token.)

---

### Step 3: Commit

```bash
git add apps/game/src/pages/ResultsPage.tsx apps/game/src/App.tsx
git commit -m "feat(game): add /results/:runId post-run summary page"
```

---

## Task 8: Add /debug route (dev only)

**Goal:** A dev-only page at `/debug` that lets you pick any preset/map, any items (no inventory restriction), and create a debug run (starts `active` immediately, no pending state). Also adds an auto-tick toggle when playing a debug run.

**Files:**
- Create: `apps/game/src/pages/DebugPage.tsx`
- Modify: `apps/game/src/App.tsx`
- Modify: `apps/game/src/game/Game.tsx` (auto-tick toggle for debug runs)

---

### Step 1: Create DebugPage.tsx

```tsx
// apps/game/src/pages/DebugPage.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRun } from '../api/dungeon';
import { ITEM_DEFS } from '@org/items';

// All known preset/map IDs
const PRESET_IDS = [
  'default', 'open', 'maze', 'oil_trap', 'terminal_door',
  'fire_stress', 'mine_chain', 'ai_maze_regression', 'kill_room', 'exit_room',
];

const ITEM_OPTIONS = Object.values(ITEM_DEFS).map((def) => ({
  id: def.id,
  name: def.name,
}));

export function DebugPage() {
  // Guard: only render in dev
  if (!import.meta.env.DEV) {
    return <p>Debug page not available in production.</p>;
  }

  const navigate = useNavigate();
  const [preset, setPreset] = useState('open');
  const [slotA, setSlotA] = useState<string>('');
  const [slotB, setSlotB] = useState<string>('');
  const [ammoQty, setAmmoQty] = useState(10);
  const [ammoItemId, setAmmoItemId] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setError(null);
    try {
      const profile = {
        inventory: ammoItemId && ammoQty > 0 ? { [ammoItemId]: ammoQty } : {},
        loadout: {
          slotA: slotA || null,
          slotB: slotB || null,
          activeSlot: 'A' as const,
        },
      };
      const { runId } = await createRun({
        preset,
        profile,
        debug: true,
        metaMode: 'bypass',
      });
      navigate(`/game/${runId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start debug run');
    }
  }

  return (
    <div style={{ maxWidth: 500, margin: '40px auto', padding: '0 16px' }}>
      <h1>Debug Launcher</h1>
      <p style={{ color: '#aaa' }}>Dev only — bypasses inventory and escrow</p>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <label>
        Preset / Map:
        <select value={preset} onChange={(e) => setPreset(e.target.value)}>
          {PRESET_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>

      <label>
        Slot A:
        <select value={slotA} onChange={(e) => setSlotA(e.target.value)}>
          <option value="">— None —</option>
          {ITEM_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>

      <label>
        Slot B:
        <select value={slotB} onChange={(e) => setSlotB(e.target.value)}>
          <option value="">— None —</option>
          {ITEM_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>

      <label>
        Ammo Item:
        <select value={ammoItemId} onChange={(e) => setAmmoItemId(e.target.value)}>
          <option value="">— None —</option>
          {ITEM_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>

      <label>
        Ammo Qty:
        <input
          type="number"
          min={0}
          max={99}
          value={ammoQty}
          onChange={(e) => setAmmoQty(Number(e.target.value))}
        />
      </label>

      <button
        onClick={handleStart}
        style={{ marginTop: 24, padding: '12px 32px', fontSize: 18, cursor: 'pointer' }}
      >
        Launch Debug Run
      </button>
    </div>
  );
}
```

---

### Step 2: Add auto-tick toggle to Game.tsx for debug runs

The run object returned by `createRun` includes `debug: true`. Pass this prop to `GamePage` via route state or URL search param.

**Approach:** Use `useLocation` to check `location.state?.debug`, or add `?debug=true` to the URL when navigating from DebugPage.

In `DebugPage.tsx`, change the navigate call:
```typescript
navigate(`/game/${runId}?debug=true`);
```

In `Game.tsx` (now `GamePage`), add auto-tick:
```typescript
import { useSearchParams } from 'react-router-dom';

const [searchParams] = useSearchParams();
const isDebug = searchParams.get('debug') === 'true';
const [autoTick, setAutoTick] = useState(false);

// Auto-tick interval
useEffect(() => {
  if (!isDebug || !autoTick) return;
  const interval = setInterval(() => {
    stepTick(runId!).catch(console.error);
  }, 500);
  return () => clearInterval(interval);
}, [isDebug, autoTick, runId]);

// In HUD, when isDebug:
{isDebug && (
  <div>
    <label>
      <input
        type="checkbox"
        checked={autoTick}
        onChange={(e) => setAutoTick(e.target.checked)}
      />
      Auto-tick (500ms)
    </label>
  </div>
)}
```

---

### Step 3: Add route in App.tsx

```tsx
import { DebugPage } from './pages/DebugPage';
// In <Routes> — no auth required for debug, it's dev-only:
<Route path="/debug" element={<DebugPage />} />
```

---

### Step 4: Add /debug link to Header (dev only)

In `apps/game/src/components/Header.tsx`, show the debug link only in dev:

```tsx
{import.meta.env.DEV && <NavLink to="/debug">Debug</NavLink>}
```

---

### Step 5: Commit

```bash
git add apps/game/src/pages/DebugPage.tsx apps/game/src/game/Game.tsx apps/game/src/components/Header.tsx apps/game/src/App.tsx
git commit -m "feat(game): add dev-only /debug route with auto-tick toggle"
```

---

## Task 9: Lazy room loading in dungeon-service

**Goal:** When `checkPortalTransition` finds that `state.rooms[targetMapId]` is missing, load the room from a TMX file on disk and populate `state.rooms[targetMapId]` before continuing.

**Room grid resolution:** The server needs wall/floor data. Use a JSON sidecar file: `apps/dungeon-ui/public/tiles/room-<id>.room.json` with shape `{ "layout": ["##########", "#........#", ...] }`. If absent, use a blank floor grid matching the source room dimensions.

**Files:**
- Modify: `apps/dungeon-service/src/engine/turn.ts`
- Modify: `apps/dungeon-service/src/engine/tmx-loader.ts` (add `buildRoomGrid` helper)
- Modify: `apps/dungeon-service/src/models/presets.ts` (add `resolveTmxPath` export)
- Test: `apps/dungeon-service/src/engine/turn.spec.ts`

---

### Step 1: Write a failing test

In `apps/dungeon-service/src/engine/turn.spec.ts`, add:

```typescript
it('lazy loads a room from TMX when portal target is not in state.rooms', () => {
  // Create a state where the player is on a portal tile pointing to 'room-b'
  // but state.rooms['room-b'] does not exist
  const s = makeState();
  s.grid[1][1] = {
    type: 'floor',
    items: [],
    effects: [],
    portal: { name: 'exit-to-b', targetMapId: 'room-b', targetEnterId: 'enter-from-a' },
  } as any;
  s.player.pos = { x: 1, y: 1 };
  // state.rooms is empty — room-b not pre-loaded

  // This should NOT warn and stay — it should load room-b lazily
  // Since we don't have the actual file in tests, we expect it to fall back gracefully
  // Mock the loader to return a stub room:
  vi.mock('../engine/tmx-loader.js', () => ({
    loadTmxFile: vi.fn().mockReturnValue({
      spawns: [{ name: 'enter-from-a', x: 1, y: 1 }],
      extract: null,
      triggers: [],
      enemies: [],
      portals: { exits: [], enters: [{ name: 'enter-from-a', x: 1, y: 1 }] },
      nameIndex: {},
    }),
  }));

  const { state: s2, turnEvents } = processTurn(s, { type: 'wait' });
  const transition = turnEvents.find(e => e.type === 'room_transition');
  expect(transition).toBeDefined();
  expect((transition as any).toMapId).toBe('room-b');
});
```

Run: `pnpm nx test dungeon-service --no-tui`
Expected: FAIL (room transition does not happen, warning is logged instead)

---

### Step 2: Add `buildRoomGrid` to tmx-loader.ts

In `apps/dungeon-service/src/engine/tmx-loader.ts`, add a helper that builds a blank-floor `Grid` matching given dimensions:

```typescript
import type { Grid, Tile } from '@org/shared';
import { existsSync, readFileSync } from 'fs';

export function buildRoomGrid(
  tmxPath: string,
  width: number,
  height: number
): Grid {
  // Try JSON sidecar file for wall layout
  const sidecarPath = tmxPath.replace(/\.tmx$/, '.room.json');
  if (existsSync(sidecarPath)) {
    const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf-8')) as { layout: string[] };
    return sidecar.layout.map((row) =>
      row.split('').map((ch): Tile => ({
        type: ch === '#' ? 'wall' : 'floor',
        items: [],
        effects: [],
      }))
    );
  }
  // Fallback: blank floor grid with walls on perimeter
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x): Tile => ({
      type: (x === 0 || x === width - 1 || y === 0 || y === height - 1) ? 'wall' : 'floor',
      items: [],
      effects: [],
    }))
  );
}
```

---

### Step 3: Update `checkPortalTransition` in turn.ts

Replace the current "warn and stay" block with lazy loading:

```typescript
// Before (lines 392-398 in turn.ts):
if (!targetRoom) {
  console.warn(`[room transition] target room '${portal.targetMapId}' not in state.rooms — staying`);
  // Undo the freeze (restore current room)
  const { [state.currentRoomId]: _removed, ...rest } = state.rooms;
  state.rooms = rest;
  return;
}

// After:
if (!targetRoom) {
  const loaded = lazyLoadRoom(portal.targetMapId, state);
  if (!loaded) {
    // Could not load — undo freeze and stay
    const { [state.currentRoomId]: _removed, ...rest } = state.rooms;
    state.rooms = rest;
    return;
  }
  state.rooms[portal.targetMapId] = loaded;
}
```

Add the `lazyLoadRoom` helper function at the bottom of turn.ts:

```typescript
import { loadTmxFile, buildRoomGrid } from './tmx-loader.js';
import { resolveTmxPath } from '../models/presets.js';
import type { RoomState, Tile, Entity, MechanismDef } from '@org/shared';

function lazyLoadRoom(mapId: string, state: RunState): RoomState | null {
  try {
    const tmxPath = resolveTmxPath(`room-${mapId}.tmx`);
    const tmx = loadTmxFile(tmxPath);
    const { config } = state;
    const width = config.width;
    const height = config.height;
    const grid = buildRoomGrid(tmxPath, width, height);

    // Place extract tile
    if (tmx.extract) {
      const extractTile = grid[tmx.extract.y]?.[tmx.extract.x];
      if (extractTile) extractTile.type = 'exit';
    }

    // Place portal tiles
    for (const exit of tmx.portals.exits) {
      const tile = grid[exit.y]?.[exit.x];
      if (tile) {
        (tile as Tile & Record<string, unknown>)['portal'] = {
          name: exit.name,
          targetMapId: exit.targetMapId,
          targetEnterId: exit.targetEnterId,
        };
      }
    }
    for (const enter of tmx.portals.enters) {
      const tile = grid[enter.y]?.[enter.x];
      if (tile) {
        (tile as Tile & Record<string, unknown>)['portal'] = {
          name: enter.name,
          type: 'map_enter',
        };
      }
    }

    // Build enemies from TMX
    const enemies: Entity[] = tmx.enemies.map((e) => ({
      id: e.name,
      kind: 'enemy' as const,
      pos: { x: e.x, y: e.y },
      hp: e.hp,
      maxHp: e.maxHp,
      attackDamage: e.attackDamage,
      aiType: e.aiType,
      state: e.patrolWaypoints ? { waypoints: e.patrolWaypoints, index: 0 } : {},
    }));

    return {
      mapId,
      grid,
      enemies,
      mechanisms: [] as MechanismDef[],
      pendingExplosions: [],
    };
  } catch (err) {
    console.warn(`[lazy room load] failed to load room '${mapId}':`, err);
    return null;
  }
}
```

**Also export `resolveTmxPath` from presets.ts** if it isn't already (it was added in the map properties plan — check that it's exported):

```typescript
// In apps/dungeon-service/src/models/presets.ts
export function resolveTmxPath(filename: string): string {
  return resolve(__dirname, '../../../../dungeon-ui/public/tiles', filename);
}
```

---

### Step 4: Run tests

```bash
pnpm nx test dungeon-service --no-tui
```

Expected: all tests pass including the new lazy load test.

---

### Step 5: Commit

```bash
git add apps/dungeon-service/src/engine/turn.ts \
        apps/dungeon-service/src/engine/tmx-loader.ts \
        apps/dungeon-service/src/engine/turn.spec.ts \
        apps/dungeon-service/src/models/presets.ts
git commit -m "feat(dungeon-service): lazy TMX room loading on portal transition"
```

---

## Task 10: Update Caddy proxy, service.sh, and delete old apps

**Goal:** Simplify Caddy to route everything to `apps/game` at port 4200. Update `service.sh` to replace `meta-ui` and `dungeon-ui` entries with `game`. Delete the old app packages.

**Files:**
- Modify: `packages/proxy/Caddyfile`
- Modify: `.claude/skills/dev/scripts/service.sh`
- Delete: `apps/meta-ui/`
- Delete: `apps/dungeon-ui/`
- Modify: `pnpm-workspace.yaml` (if old apps are listed)
- Modify: `tsconfig.base.json` (if old apps have path aliases)

---

### Step 1: Update Caddyfile

Replace `packages/proxy/Caddyfile` with:

```caddyfile
:8080 {
    # Dungeon Engine REST API + WebSocket (Caddy upgrades WS automatically)
    handle /api/dungeon/* {
        uri strip_prefix /api/dungeon
        reverse_proxy localhost:3001
    }

    # Meta Game Service REST API
    handle /api/meta/* {
        uri strip_prefix /api/meta
        reverse_proxy localhost:3000
    }

    # Unified Game App
    handle {
        reverse_proxy localhost:4200
    }
}
```

Key changes:
- Remove the `/meta-ui/*` route block (that had `base=/meta-ui/`)
- Catch-all now points to port 4200 (was 4201)

---

### Step 2: Update service.sh

In `.claude/skills/dev/scripts/service.sh`:

Change `SERVICE_ORDER`:
```bash
SERVICE_ORDER=(meta-service dungeon-service game proxy)
```

Update `get_def()`:
```bash
get_def() {
  case "$1" in
    meta-service)    echo "meta-service:serve:3000:JWT_SECRET=my-dev-secret-1234" ;;
    dungeon-service) echo "dungeon-service:serve:3001:" ;;
    game)            echo "game:serve:4200:" ;;
    proxy)           echo "proxy:serve:8080:" ;;
    *)               echo "" ;;
  esac
}
```

Update `is_valid_service()`:
```bash
is_valid_service() {
  case "$1" in
    meta-service|dungeon-service|game|proxy) return 0 ;;
    *) return 1 ;;
  esac
}
```

Update `expand_name()` — remove `mu` and `du` aliases, add `g` for game:
```bash
expand_name() {
  case "$1" in
    ms)  echo "meta-service" ;;
    ds)  echo "dungeon-service" ;;
    g)   echo "game" ;;
    *)   echo "$1" ;;
  esac
}
```

---

### Step 3: Delete old app packages

```bash
rm -rf apps/meta-ui
rm -rf apps/dungeon-ui
```

---

### Step 4: Clean up workspace references

Check `pnpm-workspace.yaml` — old apps may be listed. Remove them if so:
```yaml
packages:
  - 'apps/*'
  - 'libs/*'
  - 'packages/*'
```

If using `apps/*` glob, no change needed. If apps are listed individually, remove the old entries.

Check `tsconfig.base.json` for any path aliases pointing at the deleted apps (e.g., `@dungeon-ui/*`). Remove them if present.

---

### Step 5: Update dungeon-ui-e2e to point at apps/game

The e2e tests in `packages/dungeon-ui-e2e` have `implicitDependencies: ["dungeon-ui"]`. Update the NX project to point at `game`:

In `packages/dungeon-ui-e2e/project.json` (if it exists):
```json
{
  "implicitDependencies": ["game"]
}
```

Update `packages/dungeon-ui-e2e/playwright.config.ts` — change `webServer.url` to `http://localhost:4200` and `baseURL` similarly.

---

### Step 6: Verify everything builds

```bash
pnpm nx run-many -t build --projects=dungeon-service,meta-service,game
pnpm nx test dungeon-service --no-tui
```

Fix any remaining import errors.

---

### Step 7: Test with dev services

```bash
bash .claude/skills/dev/scripts/service.sh start all
```

Visit http://localhost:8080 — should load `apps/game` at `/`. Login, navigate to `/inventory`, click the Play button → should go to `/loadout`.

---

### Step 8: Commit

```bash
git add packages/proxy/Caddyfile .claude/skills/dev/scripts/service.sh packages/dungeon-ui-e2e/ pnpm-workspace.yaml tsconfig.base.json
git commit -m "feat: update proxy and service scripts for unified game app, delete old apps"
```

---

## Verification Checklist

After all tasks are complete:

1. `pnpm nx run-many -t build --all` — clean build
2. `pnpm nx test dungeon-service --no-tui` — all server tests pass
3. Start all services: `bash .claude/skills/dev/scripts/service.sh start all`
4. http://localhost:8080 → loads `apps/game`
5. `/login` → login → `/inventory` → "Play" button → `/loadout`
6. `/loadout` → pick loadout → confirm → `/game/:runId`
7. `/game/:runId` → shows "Ready to Start" (pending state) → click Start → game begins
8. Play to exit or die → navigates to `/results/:runId`
9. `/results/:runId` → shows outcome + items → button back to `/inventory`
10. http://localhost:8080/debug (dev build only) → debug launcher → creates active run
11. `bash .claude/skills/dev/scripts/service.sh status` → shows meta-service, dungeon-service, game, proxy

---

## Notes for Implementer

- **NX project name for `apps/game`**: the generator will use `game` as the NX project name. Verify with `pnpm nx show project game`.
- **`@org/items` ITEM_DEFS**: imported in DebugPage as `import { ITEM_DEFS } from '@org/items'`. This is a path alias from `tsconfig.base.json`.
- **WS connection**: `Game.tsx` uses `new WebSocket(getWsUrl(runId))`. In dev, this hits Caddy at port 8080. Caddy auto-upgrades to WS.
- **`resolveTmxPath` in turn.ts**: after deleting `apps/dungeon-ui`, the tile path in presets.ts must be updated to point at `apps/game/public/tiles/`. Update `resolveTmxPath` to use `apps/game` instead of `dungeon-ui`.
- **`pending` status guard in routes.ts**: the existing guard `if (state.status !== 'active')` at line 71 already handles `pending` correctly (returns error). No change needed there.
- **Escrow integration**: Task 6 (LoadoutPage) is stubbed — it doesn't create an escrow before the run. Full meta/dungeon escrow integration is a separate future task.
