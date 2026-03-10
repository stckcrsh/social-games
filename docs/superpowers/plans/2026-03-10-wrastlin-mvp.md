# Wrastlin MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable wrastlin MVP with a manager UI (chat + weekly submission), a deterministic match resolver, and a CLI job that generates a full show from submitted data.

**Architecture:** Single Fastify v5 game server (`apps/wrastlin/meta-service`, NX project `wrastlin-service`) backed by JSON flat files. React 18 + Vite manager UI (`apps/wrastlin/game`). All shared TypeScript types in `libs/wrastlin/shared`. Show generation runs as a Node script (NX target `generate-show`), not an HTTP endpoint.

**Tech Stack:** Fastify v5, esbuild (CJS), React 18, Vite, Vitest 3, TypeScript (nodenext on server, bundler on client), uuid, zod

---

## File Map

### `libs/wrastlin/shared/`
| File | Responsibility |
|------|----------------|
| `src/index.ts` | Re-exports all public types |
| `src/types/wrestler.ts` | `Wrestler`, `Memory`, `Relationship` interfaces |
| `src/types/manager.ts` | `Manager` interface |
| `src/types/show.ts` | `Show`, `Segment`, `MatchResult` interfaces |
| `src/types/submission.ts` | `WeeklySubmission` interface |
| `src/types/state.ts` | `WeeklyState`, `WeekPhase` type |
| `tsconfig.json` | Composite tsconfig root |
| `tsconfig.lib.json` | Compiler options (outDir, rootDir) |

### `apps/wrastlin/meta-service/` (NX: `wrastlin-service`, port 3002)
| File | Responsibility |
|------|----------------|
| `project.json` | NX targets: build, serve, test, generate-show |
| `tsconfig.json` | Composite tsconfig root (references app config) |
| `tsconfig.app.json` | Compiler options, references wrastlin-shared |
| `vitest.config.mts` | Vitest setup with `@org/wrastlin-shared` alias, `pool: forks` |
| `scripts/build.js` | esbuild CJS bundle with alias for `@org/wrastlin-shared` |
| `src/main.ts` | Fastify entry: register plugins, routes, start server |
| `src/api/wrestlers.ts` | `GET /wrestlers`, `GET /wrestlers/:id` |
| `src/api/managers.ts` | `GET /managers/:id`, `POST /managers/:id/chat` |
| `src/api/submissions.ts` | `POST /submissions`, `GET /submissions/week/:week` |
| `src/api/state.ts` | `GET /state`, `POST /state/close-submissions` |
| `src/core/weeklyOrchestrator.ts` | State machine transitions, week counter |
| `src/core/gameState.ts` | Load / save full world state |
| `src/wrestlers/wrestlerState.ts` | Read / write individual wrestler records |
| `src/wrestlers/decisionEngine.ts` | Evaluate manager chat → trust delta + emotion delta |
| `src/wrestlers/memorySystem.ts` | Append / query wrestler memories |
| `src/managers/managerService.ts` | Read / write manager records |
| `src/storyteller/matchResolver.ts` | Deterministic match outcome from two wrestlers + context |
| `src/storyteller/segmentResolver.ts` | Resolve a single show segment |
| `src/storyteller/showGenerator.ts` | Full 7-step show pipeline |
| `src/data/persistence.ts` | Generic JSON read / write utilities |
| `src/generate-show.ts` | CLI entry for the `generate-show` NX target |
| `data/wrestlers.json` | Seed data: 6 wrestlers |
| `data/managers.json` | Seed data: 1 manager (for solo testing) |
| `data/state.json` | Initial weekly state |

### `apps/wrastlin/game/` (NX: `wrastlin-game`, port 4300)
| File | Responsibility |
|------|----------------|
| `project.json` | NX targets: serve, build, preview |
| `tsconfig.json` | Composite tsconfig root |
| `tsconfig.app.json` | Browser compiler options (bundler module, jsx) |
| `vite.config.mts` | Vite config, `nxViteTsPaths()`, ports 4300 |
| `index.html` | HTML entry |
| `src/main.tsx` | React DOM render |
| `src/App.tsx` | React Router: `/` → WrestlerDashboard, `/submit` → SubmissionForm |
| `src/views/WrestlerDashboard.tsx` | Wrestler stats card + chat panel |
| `src/views/SubmissionForm.tsx` | Weekly submission form |
| `src/components/ChatPanel.tsx` | Message list + input box |
| `src/components/WrestlerCard.tsx` | Display wrestler name, gimmick, stats, emotions |
| `src/api/client.ts` | Typed fetch wrappers for all game server endpoints |

### Root config changes
| File | Change |
|------|--------|
| `tsconfig.base.json` | Add `@org/wrastlin-shared` path alias |

---

## Chunk 1: Project Scaffolding

**Goal:** All wrastlin NX packages build and lint cleanly. No source logic yet.

### Task 1: Add `@org/wrastlin-shared` path alias to workspace tsconfig

**Files:**
- Modify: `tsconfig.base.json`

- [ ] **Step 1: Read current paths**

Open `tsconfig.base.json` and find the `"paths"` section.

- [ ] **Step 2: Add wrastlin-shared alias**

In `tsconfig.base.json`, add to `compilerOptions.paths`:
```json
"@org/wrastlin-shared": ["./libs/wrastlin/shared/src/index.ts"]
```

- [ ] **Step 3: Update root `tsconfig.json` references**

The root `tsconfig.json` has a `references` array listing all composite projects. Add all wrastlin packages:
```json
{ "path": "./libs/wrastlin/shared" },
{ "path": "./apps/wrastlin/meta-service" },
{ "path": "./apps/wrastlin/game" }
```

- [ ] **Step 4: Commit**
```bash
git add tsconfig.base.json tsconfig.json
git commit -m "chore: add @org/wrastlin-shared path alias and root tsconfig references"
```

---

### Task 2: Scaffold `libs/wrastlin/shared` tsconfigs

**Files:**
- Create: `libs/wrastlin/shared/tsconfig.json`
- Create: `libs/wrastlin/shared/tsconfig.lib.json`
- Create: `libs/wrastlin/shared/src/index.ts`

- [ ] **Step 1: Create `tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [{ "path": "./tsconfig.lib.json" }]
}
```

- [ ] **Step 2: Create `tsconfig.lib.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/libs/wrastlin/shared",
    "rootDir": "src",
    "types": ["node"],
    "tsBuildInfoFile": "../../../dist/libs/wrastlin/shared/tsconfig.lib.tsbuildinfo"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `src/index.ts` placeholder**

```typescript
// Types exported here as they are added
export {};
```

- [ ] **Step 4: Commit**
```bash
git add libs/wrastlin/shared/
git commit -m "chore: scaffold libs/wrastlin/shared tsconfigs"
```

---

### Task 3: Scaffold `wrastlin-service` (meta-service) config

**Files:**
- Modify: `apps/wrastlin/meta-service/package.json`
- Create: `apps/wrastlin/meta-service/project.json`
- Create: `apps/wrastlin/meta-service/tsconfig.json`
- Create: `apps/wrastlin/meta-service/tsconfig.app.json`
- Create: `apps/wrastlin/meta-service/vitest.config.mts`
- Create: `apps/wrastlin/meta-service/scripts/build.js`

- [ ] **Step 1: Update `package.json`**

```json
{
  "name": "@org/wrastlin-meta-service",
  "version": "0.0.1",
  "private": true,
  "dependencies": {
    "@fastify/cors": "^10.0.2",
    "fastify": "~5.2.1",
    "uuid": "^11.1.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/uuid": "^10.0.0",
    "@vitest/coverage-v8": "^3.2.4",
    "esbuild": "^0.25.0",
    "vitest": "^3.2.4"
  }
}
```

- [ ] **Step 2: Create `project.json`**

```json
{
  "name": "wrastlin-service",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/wrastlin/meta-service/src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "nx:run-commands",
      "outputs": ["{workspaceRoot}/dist/apps/wrastlin/meta-service"],
      "options": {
        "command": "node scripts/build.js",
        "cwd": "apps/wrastlin/meta-service"
      }
    },
    "serve": {
      "continuous": true,
      "executor": "nx:run-commands",
      "options": {
        "command": "node scripts/build.js && node dist/main.js",
        "cwd": "apps/wrastlin/meta-service"
      }
    },
    "test": {
      "executor": "nx:run-commands",
      "outputs": ["{workspaceRoot}/coverage/apps/wrastlin/meta-service"],
      "options": {
        "command": "pnpm vitest run",
        "cwd": "apps/wrastlin/meta-service"
      }
    },
    "generate-show": {
      "executor": "nx:run-commands",
      "options": {
        "command": "node scripts/build.js && node dist/generate-show.js",
        "cwd": "apps/wrastlin/meta-service"
      }
    }
  },
  "tags": []
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [{ "path": "./tsconfig.app.json" }]
}
```

- [ ] **Step 4: Create `tsconfig.app.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "../../../dist/apps/wrastlin/meta-service",
    "types": ["node"],
    "rootDir": "src",
    "tsBuildInfoFile": "../../../dist/apps/wrastlin/meta-service/tsconfig.app.tsbuildinfo",
    "emitDeclarationOnly": false,
    "composite": false,
    "declaration": false,
    "declarationMap": false
  },
  "include": ["src/**/*.ts"],
  "exclude": [],
  "references": [
    { "path": "../../../libs/wrastlin/shared/tsconfig.lib.json" }
  ]
}
```

- [ ] **Step 5: Create `vitest.config.mts`**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      '@org/wrastlin-shared': path.resolve(root, '../../../libs/wrastlin/shared/src/index.ts'),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    pool: 'forks',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../../coverage/apps/wrastlin/meta-service',
    },
  },
});
```

- [ ] **Step 6: Create `scripts/build.js`**

```javascript
#!/usr/bin/env node
const esbuild = require('esbuild');
const path = require('path');

const root = path.resolve(__dirname, '..');

// Build server entry
esbuild.buildSync({
  entryPoints: [path.join(root, 'src/main.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  outfile: path.join(root, 'dist/main.js'),
  sourcemap: true,
  absWorkingDir: root,
  alias: {
    '@org/wrastlin-shared': path.resolve(root, '../../../libs/wrastlin/shared/src/index.ts'),
  },
});

// Build generate-show CLI entry
esbuild.buildSync({
  entryPoints: [path.join(root, 'src/generate-show.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  outfile: path.join(root, 'dist/generate-show.js'),
  sourcemap: true,
  absWorkingDir: root,
  alias: {
    '@org/wrastlin-shared': path.resolve(root, '../../../libs/wrastlin/shared/src/index.ts'),
  },
});

console.log('Build complete: dist/main.js, dist/generate-show.js');
```

- [ ] **Step 7: Install dependencies**

Run in a real terminal (not a background task):
```bash
cd /path/to/social-games
pnpm install
```

- [ ] **Step 8: Create stub `src/main.ts` so build passes**

```typescript
import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ ok: true }));

const start = async () => {
  await app.listen({ port: 3002, host: '0.0.0.0' });
};

start();
```

- [ ] **Step 9: Create stub `src/generate-show.ts`**

```typescript
console.log('generate-show: not yet implemented');
```

- [ ] **Step 10: Verify build passes**

```bash
pnpm nx build wrastlin-service
```
Expected: `Build complete: dist/main.js, dist/generate-show.js`

- [ ] **Step 11: Update `apps/wrastlin/CLAUDE.md`**

The CLAUDE.md for wrastlin currently lists the NX project name as `wrastlin-meta-service`. Update it to reflect the actual project name `wrastlin-service` and add port 3002.

- [ ] **Step 12: Commit**
```bash
git add apps/wrastlin/meta-service/ apps/wrastlin/CLAUDE.md
git commit -m "chore: scaffold wrastlin-service config, build, and stubs"
```

---

### Task 4: Scaffold `wrastlin-game` (React UI) config

**Files:**
- Modify: `apps/wrastlin/game/package.json`
- Create: `apps/wrastlin/game/project.json`
- Create: `apps/wrastlin/game/tsconfig.json`
- Create: `apps/wrastlin/game/tsconfig.app.json`
- Create: `apps/wrastlin/game/vite.config.mts`
- Create: `apps/wrastlin/game/index.html`
- Create: `apps/wrastlin/game/src/main.tsx`
- Create: `apps/wrastlin/game/src/App.tsx`

- [ ] **Step 1: Update `package.json`**

```json
{
  "name": "@org/wrastlin-game",
  "version": "0.0.1",
  "private": true,
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.30.3"
  },
  "devDependencies": {
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.4",
    "@nx/vite": "*",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create `project.json`**

```json
{
  "name": "wrastlin-game",
  "$schema": "../../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/wrastlin/game/src",
  "projectType": "application",
  "targets": {
    "build": {
      "executor": "@nx/vite:build",
      "outputs": ["{workspaceRoot}/dist/apps/wrastlin/game"],
      "options": {
        "configFile": "apps/wrastlin/game/vite.config.mts"
      }
    },
    "serve": {
      "executor": "@nx/vite:dev-server",
      "continuous": true,
      "options": {
        "configFile": "apps/wrastlin/game/vite.config.mts"
      }
    },
    "preview": {
      "executor": "@nx/vite:preview-server",
      "continuous": true,
      "options": {
        "configFile": "apps/wrastlin/game/vite.config.mts"
      }
    }
  },
  "tags": []
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "files": [],
  "include": [],
  "references": [{ "path": "./tsconfig.app.json" }],
  "extends": "../../../tsconfig.base.json"
}
```

- [ ] **Step 4: Create `tsconfig.app.json`**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "tsBuildInfoFile": "dist/tsconfig.app.tsbuildinfo",
    "jsx": "react-jsx",
    "lib": ["dom", "es2022"],
    "types": [
      "node",
      "vite/client"
    ],
    "rootDir": "src",
    "module": "esnext",
    "moduleResolution": "bundler"
  },
  "exclude": ["dist", "src/**/*.spec.ts", "src/**/*.spec.tsx"],
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "references": [
    { "path": "../../../libs/wrastlin/shared/tsconfig.lib.json" }
  ]
}
```

- [ ] **Step 5: Create `vite.config.mts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/apps/wrastlin/game',
  server: {
    port: 4300,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3002',
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
  preview: {
    port: 4300,
    host: '0.0.0.0',
  },
  plugins: [react(), nxViteTsPaths()],
  build: {
    outDir: '../../../dist/apps/wrastlin/game',
    reportCompressedSize: true,
    commonjsOptions: { transformMixedEsModules: true },
  },
});
```

- [ ] **Step 6: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Wrastlin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `src/main.tsx`**

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 8: Create `src/App.tsx` stub**

```typescript
export default function App() {
  return <div><h1>Wrastlin</h1><p>Coming soon.</p></div>;
}
```

- [ ] **Step 9: Install + verify serve**

Run in a real terminal:
```bash
pnpm install
pnpm nx serve wrastlin-game
```
Expected: Vite dev server on http://localhost:4300, page renders "Wrastlin / Coming soon."

- [ ] **Step 10: Commit**
```bash
git add apps/wrastlin/game/
git commit -m "chore: scaffold wrastlin-game vite/react config and stub UI"
```

---

## Chunk 2: Core Types

**Goal:** All shared TypeScript interfaces exist in `libs/wrastlin/shared/src/`. Everything compiles.

### Task 5: Wrestler, Memory, Relationship types

**Files:**
- Create: `libs/wrastlin/shared/src/types/wrestler.ts`
- Modify: `libs/wrastlin/shared/src/index.ts`

- [ ] **Step 1: Create `src/types/wrestler.ts`**

```typescript
export interface Relationship {
  wrestlerId: string;
  hatred: number;   // 1-10
  respect: number;  // 1-10
  trust: number;    // 1-10
}

export type MemoryType = 'humiliation' | 'betrayal' | 'victory' | 'injury' | 'promo';

export interface Memory {
  memoryId: string;
  type: MemoryType;
  source: string;   // wrestlerId or 'manager'
  target: string;
  week: number;
  intensity: number; // 1-10
}

export interface WrestlerStats {
  strength: number;   // 1-100
  agility: number;
  endurance: number;
  charisma: number;
}

export interface WrestlerPersonality {
  ego: number;        // 1-10
  anger: number;
  honor: number;
  loyalty: number;
  ambition: number;
}

export interface WrestlerEmotions {
  confidence: number; // 1-10
  frustration: number;
  fatigue: number;
}

export interface Wrestler {
  wrestlerId: string;
  name: string;
  gimmick: string;
  stats: WrestlerStats;
  personality: WrestlerPersonality;
  emotionalState: WrestlerEmotions;
  relationships: Relationship[];
  memories: Memory[];
  managerTrust: number; // 1-10
}
```

- [ ] **Step 2: Export from `src/index.ts`**

```typescript
export * from './types/wrestler.js';
```

- [ ] **Step 3: Commit**
```bash
git add libs/wrastlin/shared/src/
git commit -m "feat(wrastlin-shared): add Wrestler, Memory, Relationship types"
```

---

### Task 6: Manager, Submission, State types

**Files:**
- Create: `libs/wrastlin/shared/src/types/manager.ts`
- Create: `libs/wrastlin/shared/src/types/submission.ts`
- Create: `libs/wrastlin/shared/src/types/state.ts`
- Modify: `libs/wrastlin/shared/src/index.ts`

- [ ] **Step 1: Create `src/types/manager.ts`**

```typescript
export type TrustLevel = 'low' | 'medium' | 'high';

export interface Manager {
  managerId: string;
  wrestlerId: string;
  money: number;
  trustLevel: TrustLevel;
}
```

- [ ] **Step 2: Create `src/types/submission.ts`**

```typescript
export type MatchStyle = 'technical' | 'brawl' | 'high-fly' | 'heel' | 'face';
export type StoryRequestType = 'push' | 'feud' | 'betrayal' | 'title-shot' | 'promo';

export interface ManagerAdvice {
  matchStyle: MatchStyle;
  targetOpponent?: string; // wrestlerId
}

export interface StoryRequest {
  type: StoryRequestType;
  target?: string; // wrestlerId
  bribeAmount: number;
}

export interface WeeklySubmission {
  submissionId: string;
  managerId: string;
  week: number;
  advice: ManagerAdvice;
  storyRequests: StoryRequest[];
  submittedAt: string; // ISO timestamp
}
```

- [ ] **Step 3: Create `src/types/state.ts`**

```typescript
export type WeekPhase =
  | 'week_open'
  | 'submissions_closed'
  | 'show_generated';

export interface WeeklyState {
  currentWeek: number;
  phase: WeekPhase;
  updatedAt: string; // ISO timestamp
}
```

- [ ] **Step 4: Update `src/index.ts`**

```typescript
export * from './types/wrestler.js';
export * from './types/manager.js';
export * from './types/submission.js';
export * from './types/state.js';
```

- [ ] **Step 5: Commit**
```bash
git add libs/wrastlin/shared/src/
git commit -m "feat(wrastlin-shared): add Manager, WeeklySubmission, WeeklyState types"
```

---

### Task 7: Show types

**Files:**
- Create: `libs/wrastlin/shared/src/types/show.ts`
- Modify: `libs/wrastlin/shared/src/index.ts`

- [ ] **Step 1: Create `src/types/show.ts`**

```typescript
export type FinishType =
  | 'clean'
  | 'dirty'
  | 'interference'
  | 'count-out'
  | 'dq'
  | 'no-contest';

export type CrowdReaction = 'hot' | 'lukewarm' | 'dead';

export type SegmentType =
  | 'opening-promo'
  | 'singles-match'
  | 'backstage-confrontation'
  | 'interview'
  | 'betrayal'
  | 'title-match'
  | 'main-event';

export interface MatchResult {
  matchId: string;
  participants: string[];       // wrestlerIds
  winner: string;               // wrestlerId
  finishType: FinishType;
  crowdReaction: CrowdReaction;
  moments: string[];            // narrative beat strings
  narration: string;
}

export interface Segment {
  segmentId: string;
  type: SegmentType;
  participants: string[];
  matchResult?: MatchResult;
  narration: string;
}

export interface Show {
  showId: string;
  week: number;
  segments: Segment[];
  crowdReaction: CrowdReaction;
  generatedAt: string; // ISO timestamp
}
```

- [ ] **Step 2: Update `src/index.ts`**

Add:
```typescript
export * from './types/show.js';
```

- [ ] **Step 3: Commit**
```bash
git add libs/wrastlin/shared/src/
git commit -m "feat(wrastlin-shared): add Show, Segment, MatchResult types"
```

---

## Chunk 3: Persistence + Seed Data

**Goal:** JSON file persistence layer works, seed data loads.

### Task 8: Persistence utilities

**Files:**
- Create: `apps/wrastlin/meta-service/src/data/persistence.ts`

- [ ] **Step 1: Create `persistence.ts`**

```typescript
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = path.resolve(__dirname, '../../data');

export function readJson<T>(filename: string): T {
  const filepath = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(filepath, 'utf-8');
  return JSON.parse(raw) as T;
}

export function writeJson<T>(filename: string, data: T): void {
  const filepath = path.join(DATA_DIR, filename);
  const dir = path.dirname(filepath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

export function readJsonOrDefault<T>(filename: string, defaultValue: T): T {
  try {
    return readJson<T>(filename);
  } catch {
    return defaultValue;
  }
}
```

Note: `__dirname` works in the esbuild CJS bundle. In vitest, the alias resolves to source so `import.meta.dirname` is needed — or use a `DATA_DIR` env var. For tests, mock `fs` or use a temp directory.

- [ ] **Step 2: Write a unit test**

Create `src/data/persistence.spec.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// We test persistence by creating a temp dir and patching DATA_DIR
// Since DATA_DIR is resolved at module load, we test the functions directly
// by reading/writing to a known temp file path.

describe('readJson / writeJson', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrastlin-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('round-trips JSON data', () => {
    const filepath = path.join(tmpDir, 'test.json');
    const data = { foo: 'bar', n: 42 };
    fs.writeFileSync(filepath, JSON.stringify(data));
    const result = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    expect(result).toEqual(data);
  });
});
```

- [ ] **Step 3: Run tests**
```bash
pnpm nx test wrastlin-service
```
Expected: 1 passed

- [ ] **Step 4: Commit**
```bash
git add apps/wrastlin/meta-service/src/data/
git commit -m "feat(wrastlin-service): add JSON persistence utilities"
```

---

### Task 9: Seed data files

**Files:**
- Create: `apps/wrastlin/meta-service/data/wrestlers.json`
- Create: `apps/wrastlin/meta-service/data/managers.json`
- Create: `apps/wrastlin/meta-service/data/state.json`

- [ ] **Step 1: Create `data/wrestlers.json`**

Six wrestlers with distinct personality archetypes (high-ego heel, honorable face, coward, brawler, showman, ambitious rookie):

```json
[
  {
    "wrestlerId": "w-001",
    "name": "Rex Dominion",
    "gimmick": "The Arrogant Champion",
    "stats": { "strength": 80, "agility": 60, "endurance": 75, "charisma": 70 },
    "personality": { "ego": 9, "anger": 7, "honor": 2, "loyalty": 3, "ambition": 8 },
    "emotionalState": { "confidence": 9, "frustration": 2, "fatigue": 3 },
    "relationships": [],
    "memories": [],
    "managerTrust": 4
  },
  {
    "wrestlerId": "w-002",
    "name": "Steel Purity",
    "gimmick": "The Honorable Warrior",
    "stats": { "strength": 75, "agility": 65, "endurance": 80, "charisma": 65 },
    "personality": { "ego": 3, "anger": 4, "honor": 10, "loyalty": 8, "ambition": 5 },
    "emotionalState": { "confidence": 7, "frustration": 3, "fatigue": 4 },
    "relationships": [],
    "memories": [],
    "managerTrust": 8
  },
  {
    "wrestlerId": "w-003",
    "name": "Slick Vince",
    "gimmick": "The Cowardly Schemer",
    "stats": { "strength": 50, "agility": 85, "endurance": 55, "charisma": 80 },
    "personality": { "ego": 6, "anger": 3, "honor": 1, "loyalty": 2, "ambition": 7 },
    "emotionalState": { "confidence": 5, "frustration": 6, "fatigue": 3 },
    "relationships": [],
    "memories": [],
    "managerTrust": 3
  },
  {
    "wrestlerId": "w-004",
    "name": "Iron Maddox",
    "gimmick": "The Unfeeling Brawler",
    "stats": { "strength": 90, "agility": 40, "endurance": 85, "charisma": 40 },
    "personality": { "ego": 5, "anger": 9, "honor": 5, "loyalty": 6, "ambition": 4 },
    "emotionalState": { "confidence": 7, "frustration": 7, "fatigue": 5 },
    "relationships": [],
    "memories": [],
    "managerTrust": 5
  },
  {
    "wrestlerId": "w-005",
    "name": "Dazzle King",
    "gimmick": "The Showman",
    "stats": { "strength": 60, "agility": 80, "endurance": 65, "charisma": 95 },
    "personality": { "ego": 7, "anger": 3, "honor": 5, "loyalty": 5, "ambition": 6 },
    "emotionalState": { "confidence": 8, "frustration": 2, "fatigue": 4 },
    "relationships": [],
    "memories": [],
    "managerTrust": 6
  },
  {
    "wrestlerId": "w-006",
    "name": "Rookie Blaze",
    "gimmick": "The Hungry Newcomer",
    "stats": { "strength": 60, "agility": 70, "endurance": 70, "charisma": 55 },
    "personality": { "ego": 4, "anger": 5, "honor": 6, "loyalty": 7, "ambition": 10 },
    "emotionalState": { "confidence": 5, "frustration": 5, "fatigue": 6 },
    "relationships": [],
    "memories": [],
    "managerTrust": 7
  }
]
```

- [ ] **Step 2: Create `data/managers.json`**

```json
[
  {
    "managerId": "m-001",
    "wrestlerId": "w-002",
    "money": 1000,
    "trustLevel": "medium"
  }
]
```

- [ ] **Step 3: Create `data/state.json`**

```json
{
  "currentWeek": 1,
  "phase": "week_open",
  "updatedAt": "2026-03-10T00:00:00.000Z"
}
```

- [ ] **Step 4: Create `data/submissions/` directory**

```bash
mkdir -p apps/wrastlin/meta-service/data/submissions
touch apps/wrastlin/meta-service/data/submissions/.gitkeep
```

- [ ] **Step 5: Create `data/shows/` directory**

```bash
mkdir -p apps/wrastlin/meta-service/data/shows
touch apps/wrastlin/meta-service/data/shows/.gitkeep
```

- [ ] **Step 6: Verify data loads**

Create a quick throwaway script `src/data/load-test.ts` (delete after verifying):
```typescript
import { readJson } from './persistence.js';
import type { Wrestler } from '@org/wrastlin-shared';

const wrestlers = readJson<Wrestler[]>('wrestlers.json');
console.log(`Loaded ${wrestlers.length} wrestlers:`);
wrestlers.forEach(w => console.log(`  ${w.name} - ${w.gimmick}`));
```

Build and run:
```bash
pnpm nx build wrastlin-service && node apps/wrastlin/meta-service/dist/main.js
```
(At this point main.ts just starts a health-check server — that's fine.)

- [ ] **Step 7: Add `.gitignore` entries**

Add to the root `.gitignore` (or create `apps/wrastlin/meta-service/data/.gitignore`):
```
submissions/*.json
shows/*.json
```
This prevents generated show and submission files from being committed.

- [ ] **Step 8: Commit**
```bash
git add apps/wrastlin/meta-service/data/
git commit -m "feat(wrastlin-service): add seed data for 6 wrestlers, 1 manager, initial state"
```

---

## Chunk 4: Game Server API

**Goal:** Fastify server running on port 3002 with wrestler/manager/submission/state routes. Test with curl.

### Task 10: Core service modules

**Files:**
- Create: `apps/wrastlin/meta-service/src/core/gameState.ts`
- Create: `apps/wrastlin/meta-service/src/wrestlers/wrestlerState.ts`
- Create: `apps/wrastlin/meta-service/src/managers/managerService.ts`
- Create: `apps/wrastlin/meta-service/src/core/weeklyOrchestrator.ts`

- [ ] **Step 1: Create `src/core/gameState.ts`**

```typescript
import { readJson, writeJson } from '../data/persistence.js';
import type { Wrestler, Manager, WeeklyState, WeeklySubmission } from '@org/wrastlin-shared';

export function loadWrestlers(): Wrestler[] {
  return readJson<Wrestler[]>('wrestlers.json');
}

export function saveWrestlers(wrestlers: Wrestler[]): void {
  writeJson('wrestlers.json', wrestlers);
}

export function loadManagers(): Manager[] {
  return readJson<Manager[]>('managers.json');
}

export function saveManagers(managers: Manager[]): void {
  writeJson('managers.json', managers);
}

export function loadState(): WeeklyState {
  return readJson<WeeklyState>('state.json');
}

export function saveState(state: WeeklyState): void {
  writeJson('state.json', state);
}

export function loadSubmissions(week: number): WeeklySubmission[] {
  try {
    return readJson<WeeklySubmission[]>(`submissions/week-${week}.json`);
  } catch {
    return [];
  }
}

export function saveSubmissions(week: number, submissions: WeeklySubmission[]): void {
  writeJson(`submissions/week-${week}.json`, submissions);
}
```

- [ ] **Step 2: Create `src/wrestlers/wrestlerState.ts`**

```typescript
import { loadWrestlers, saveWrestlers } from '../core/gameState.js';
import type { Wrestler } from '@org/wrastlin-shared';

export function getWrestler(id: string): Wrestler | undefined {
  return loadWrestlers().find(w => w.wrestlerId === id);
}

export function updateWrestler(updated: Wrestler): void {
  const wrestlers = loadWrestlers().map(w =>
    w.wrestlerId === updated.wrestlerId ? updated : w
  );
  saveWrestlers(wrestlers);
}
```

- [ ] **Step 3: Write unit test for wrestlerState**

Create `src/wrestlers/wrestlerState.spec.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as gameState from '../core/gameState.js';
import { getWrestler } from './wrestlerState.js';
import type { Wrestler } from '@org/wrastlin-shared';

const mockWrestler: Wrestler = {
  wrestlerId: 'w-test',
  name: 'Test Wrestler',
  gimmick: 'The Tester',
  stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
  personality: { ego: 5, anger: 5, honor: 5, loyalty: 5, ambition: 5 },
  emotionalState: { confidence: 5, frustration: 5, fatigue: 5 },
  relationships: [],
  memories: [],
  managerTrust: 5,
};

beforeEach(() => {
  vi.spyOn(gameState, 'loadWrestlers').mockReturnValue([mockWrestler]);
});

describe('getWrestler', () => {
  it('returns wrestler by id', () => {
    const result = getWrestler('w-test');
    expect(result).toEqual(mockWrestler);
  });

  it('returns undefined for unknown id', () => {
    expect(getWrestler('w-unknown')).toBeUndefined();
  });
});
```

- [ ] **Step 4: Run tests**
```bash
pnpm nx test wrastlin-service
```
Expected: 3 passed

- [ ] **Step 5: Create `src/managers/managerService.ts`**

```typescript
import { loadManagers, saveManagers } from '../core/gameState.js';
import type { Manager } from '@org/wrastlin-shared';

export function getManager(id: string): Manager | undefined {
  return loadManagers().find(m => m.managerId === id);
}

export function getManagerByWrestler(wrestlerId: string): Manager | undefined {
  return loadManagers().find(m => m.wrestlerId === wrestlerId);
}
```

- [ ] **Step 6: Create `src/core/weeklyOrchestrator.ts`**

```typescript
import { loadState, saveState } from './gameState.js';
import type { WeeklyState, WeekPhase } from '@org/wrastlin-shared';

export function getState(): WeeklyState {
  return loadState();
}

export function transitionTo(phase: WeekPhase): WeeklyState {
  const state = loadState();
  const validTransitions: Record<WeekPhase, WeekPhase[]> = {
    week_open: ['submissions_closed'],
    submissions_closed: ['show_generated'],
    show_generated: ['week_open'],
  };

  if (!validTransitions[state.phase].includes(phase)) {
    throw new Error(`Invalid transition: ${state.phase} → ${phase}`);
  }

  const next: WeeklyState = {
    currentWeek: phase === 'week_open' ? state.currentWeek + 1 : state.currentWeek,
    phase,
    updatedAt: new Date().toISOString(),
  };

  saveState(next);
  return next;
}
```

- [ ] **Step 7: Write unit test for weeklyOrchestrator**

Create `src/core/weeklyOrchestrator.spec.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as gameState from './gameState.js';
import { transitionTo, getState } from './weeklyOrchestrator.js';
import type { WeeklyState } from '@org/wrastlin-shared';

const baseState: WeeklyState = {
  currentWeek: 1,
  phase: 'week_open',
  updatedAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  vi.spyOn(gameState, 'loadState').mockReturnValue({ ...baseState });
  vi.spyOn(gameState, 'saveState').mockImplementation(() => {});
});

describe('transitionTo', () => {
  it('transitions week_open → submissions_closed', () => {
    const next = transitionTo('submissions_closed');
    expect(next.phase).toBe('submissions_closed');
    expect(next.currentWeek).toBe(1);
  });

  it('increments week when transitioning back to week_open', () => {
    vi.spyOn(gameState, 'loadState').mockReturnValue({ ...baseState, phase: 'show_generated' });
    const next = transitionTo('week_open');
    expect(next.currentWeek).toBe(2);
  });

  it('throws on invalid transition', () => {
    expect(() => transitionTo('show_generated')).toThrow('Invalid transition');
  });
});
```

- [ ] **Step 8: Run tests**
```bash
pnpm nx test wrastlin-service
```
Expected: 6 passed

- [ ] **Step 9: Commit**
```bash
git add apps/wrastlin/meta-service/src/
git commit -m "feat(wrastlin-service): add core service modules (gameState, wrestlerState, managerService, weeklyOrchestrator)"
```

---

### Task 11: Fastify routes + server wiring

**Files:**
- Create: `apps/wrastlin/meta-service/src/api/wrestlers.ts`
- Create: `apps/wrastlin/meta-service/src/api/managers.ts`
- Create: `apps/wrastlin/meta-service/src/api/submissions.ts`
- Create: `apps/wrastlin/meta-service/src/api/state.ts`
- Modify: `apps/wrastlin/meta-service/src/main.ts`

- [ ] **Step 1: Create `src/api/wrestlers.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { loadWrestlers } from '../core/gameState.js';
import { getWrestler } from '../wrestlers/wrestlerState.js';

export async function wrestlerRoutes(app: FastifyInstance) {
  app.get('/wrestlers', async () => {
    return loadWrestlers();
  });

  app.get<{ Params: { id: string } }>('/wrestlers/:id', async (req, reply) => {
    const wrestler = getWrestler(req.params.id);
    if (!wrestler) return reply.status(404).send({ error: 'Wrestler not found' });
    return wrestler;
  });
}
```

- [ ] **Step 2: Create `src/api/managers.ts`** (includes mock chat)

```typescript
import type { FastifyInstance } from 'fastify';
import { getManager } from '../managers/managerService.js';
import { getWrestler } from '../wrestlers/wrestlerState.js';

// Mock responses keyed by personality archetype
const MOCK_RESPONSES: Record<string, string[]> = {
  high_ego: [
    "You think I need your help? I was born to be champion.",
    "Whatever you say. Just make sure the spotlight's on me.",
  ],
  honorable: [
    "I appreciate your counsel. I will fight with everything I have.",
    "My honor is not for sale. But I will heed your words.",
  ],
  coward: [
    "Are they dangerous? Maybe we should... avoid that matchup.",
    "I'll do it! But uh... can we have a backup plan?",
  ],
  default: [
    "Understood. I'll keep that in mind for the show.",
    "Noted. Let's see how this plays out.",
  ],
};

function pickResponse(ego: number, honor: number, anger: number): string {
  const responses =
    ego >= 8 ? MOCK_RESPONSES.high_ego
    : honor >= 8 ? MOCK_RESPONSES.honorable
    : anger <= 3 ? MOCK_RESPONSES.coward
    : MOCK_RESPONSES.default;
  return responses[Math.floor(Math.random() * responses.length)];
}

export async function managerRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/managers/:id', async (req, reply) => {
    const manager = getManager(req.params.id);
    if (!manager) return reply.status(404).send({ error: 'Manager not found' });
    return manager;
  });

  app.post<{
    Params: { id: string };
    Body: { message: string };
  }>('/managers/:id/chat', async (req, reply) => {
    const manager = getManager(req.params.id);
    if (!manager) return reply.status(404).send({ error: 'Manager not found' });

    const wrestler = getWrestler(manager.wrestlerId);
    if (!wrestler) return reply.status(500).send({ error: 'Wrestler not found' });

    const response = pickResponse(
      wrestler.personality.ego,
      wrestler.personality.honor,
      wrestler.personality.anger
    );

    return {
      wrestlerId: wrestler.wrestlerId,
      wrestlerName: wrestler.name,
      message: response,
      trustDelta: 0, // mock — no state change yet
    };
  });
}
```

- [ ] **Step 3: Create `src/api/submissions.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { loadState, loadSubmissions, saveSubmissions } from '../core/gameState.js';
import type { WeeklySubmission, ManagerAdvice, StoryRequest } from '@org/wrastlin-shared';

interface SubmitBody {
  managerId: string;
  advice: ManagerAdvice;
  storyRequests: StoryRequest[];
}

export async function submissionRoutes(app: FastifyInstance) {
  app.post<{ Body: SubmitBody }>('/submissions', async (req, reply) => {
    const state = loadState();
    if (state.phase !== 'week_open') {
      return reply.status(400).send({ error: 'Submissions are closed for this week' });
    }

    const { managerId, advice, storyRequests } = req.body;
    const existing = loadSubmissions(state.currentWeek);

    if (existing.some(s => s.managerId === managerId)) {
      return reply.status(400).send({ error: 'Already submitted this week' });
    }

    const submission: WeeklySubmission = {
      submissionId: randomUUID(),
      managerId,
      week: state.currentWeek,
      advice,
      storyRequests,
      submittedAt: new Date().toISOString(),
    };

    saveSubmissions(state.currentWeek, [...existing, submission]);
    return reply.status(201).send(submission);
  });

  app.get<{ Params: { week: string } }>('/submissions/week/:week', async (req) => {
    const week = parseInt(req.params.week, 10);
    return loadSubmissions(week);
  });
}
```

- [ ] **Step 4: Create `src/api/state.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { getState, transitionTo } from '../core/weeklyOrchestrator.js';

export async function stateRoutes(app: FastifyInstance) {
  app.get('/state', async () => getState());

  app.post('/state/close-submissions', async (_, reply) => {
    try {
      const next = transitionTo('submissions_closed');
      return next;
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });

  // Called after show generation to start the next week
  app.post('/state/advance-week', async (_, reply) => {
    try {
      const next = transitionTo('week_open');
      return next;
    } catch (err) {
      return reply.status(400).send({ error: (err as Error).message });
    }
  });
}
```

- [ ] **Step 5: Update `src/main.ts`**

```typescript
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { wrestlerRoutes } from './api/wrestlers.js';
import { managerRoutes } from './api/managers.js';
import { submissionRoutes } from './api/submissions.js';
import { stateRoutes } from './api/state.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: 'http://localhost:4300' });

app.get('/health', async () => ({ ok: true }));

await app.register(wrestlerRoutes);
await app.register(managerRoutes);
await app.register(submissionRoutes);
await app.register(stateRoutes);

app.listen({ port: 3002, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
```

- [ ] **Step 6: Build and start the server**
```bash
pnpm nx build wrastlin-service
node apps/wrastlin/meta-service/dist/main.js
```

- [ ] **Step 7: Smoke test with curl**

In a second terminal:
```bash
# Health
curl http://localhost:3002/health
# → {"ok":true}

# List wrestlers
curl http://localhost:3002/wrestlers
# → JSON array of 6 wrestlers

# Get one wrestler
curl http://localhost:3002/wrestlers/w-001
# → Rex Dominion's full record

# Get manager
curl http://localhost:3002/managers/m-001
# → manager record

# Chat with wrestler
curl -X POST http://localhost:3002/managers/m-001/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"How are you feeling about the show?"}'
# → {"wrestlerName":"Steel Purity","message":"I appreciate your counsel..."}

# Check state
curl http://localhost:3002/state
# → {"currentWeek":1,"phase":"week_open",...}

# Submit for the week
curl -X POST http://localhost:3002/submissions \
  -H "Content-Type: application/json" \
  -d '{
    "managerId":"m-001",
    "advice":{"matchStyle":"technical","targetOpponent":"w-001"},
    "storyRequests":[{"type":"feud","target":"w-001","bribeAmount":200}]
  }'
# → 201 with submission record

# Read submissions back
curl http://localhost:3002/submissions/week/1
```

- [ ] **Step 8: Commit**
```bash
git add apps/wrastlin/meta-service/src/
git commit -m "feat(wrastlin-service): add wrestler/manager/submission/state API routes"
```

---

## Chunk 5: Match Resolver + Show Generator + CLI

**Goal:** Running `pnpm nx run wrastlin-service:generate-show` reads the data files and prints a full show.

### Task 12: Match resolver

**Files:**
- Create: `apps/wrastlin/meta-service/src/storyteller/matchResolver.ts`
- Create: `apps/wrastlin/meta-service/src/storyteller/matchResolver.spec.ts`

- [ ] **Step 1: Write the failing test first**

Create `src/storyteller/matchResolver.spec.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { resolveMatch } from './matchResolver.js';
import type { Wrestler } from '@org/wrastlin-shared';

const makeWrestler = (overrides: Partial<Wrestler> = {}): Wrestler => ({
  wrestlerId: 'w-test-a',
  name: 'Test A',
  gimmick: 'Tester',
  stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
  personality: { ego: 5, anger: 5, honor: 5, loyalty: 5, ambition: 5 },
  emotionalState: { confidence: 5, frustration: 5, fatigue: 5 },
  relationships: [],
  memories: [],
  managerTrust: 5,
  ...overrides,
});

describe('resolveMatch', () => {
  it('returns a match result with a winner', () => {
    const a = makeWrestler({ wrestlerId: 'w-a' });
    const b = makeWrestler({ wrestlerId: 'w-b' });
    const result = resolveMatch(a, b);
    expect([a.wrestlerId, b.wrestlerId]).toContain(result.winner);
  });

  it('includes a valid finish type', () => {
    const validFinish = ['clean', 'dirty', 'interference', 'count-out', 'dq', 'no-contest'];
    const a = makeWrestler({ wrestlerId: 'w-a' });
    const b = makeWrestler({ wrestlerId: 'w-b' });
    const result = resolveMatch(a, b);
    expect(validFinish).toContain(result.finishType);
  });

  it('higher-stat wrestler wins more often (probabilistic)', () => {
    const strong = makeWrestler({
      wrestlerId: 'w-strong',
      stats: { strength: 95, agility: 95, endurance: 95, charisma: 95 },
      emotionalState: { confidence: 9, frustration: 1, fatigue: 1 },
    });
    const weak = makeWrestler({
      wrestlerId: 'w-weak',
      stats: { strength: 20, agility: 20, endurance: 20, charisma: 20 },
      emotionalState: { confidence: 2, frustration: 8, fatigue: 8 },
    });

    let strongWins = 0;
    for (let i = 0; i < 100; i++) {
      if (resolveMatch(strong, weak).winner === 'w-strong') strongWins++;
    }
    expect(strongWins).toBeGreaterThan(70); // strong should win >70% of 100 trials
  });
});
```

- [ ] **Step 2: Run to confirm failure**
```bash
pnpm nx test wrastlin-service
```
Expected: FAIL — `matchResolver` not found

- [ ] **Step 3: Implement `src/storyteller/matchResolver.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { Wrestler, MatchResult, FinishType, CrowdReaction } from '@org/wrastlin-shared';

interface MatchContext {
  rivalryHeat?: number;      // 0-10, defaults to 0
  managerAdviceTarget?: string; // if advisor pushed for a specific opponent
}

function score(w: Wrestler): number {
  const statScore = (w.stats.strength + w.stats.agility + w.stats.endurance + w.stats.charisma) / 4;
  const emotionModifier = (w.emotionalState.confidence - w.emotionalState.fatigue) * 2;
  const frustrationPenalty = w.emotionalState.frustration * 1.5;
  return statScore + emotionModifier - frustrationPenalty;
}

function pickFinishType(winner: Wrestler, loser: Wrestler, rivalryHeat: number): FinishType {
  const heelTendency = (10 - winner.personality.honor) / 10; // low honor = more likely heel finish
  const rand = Math.random();

  if (rivalryHeat >= 8 && rand < 0.3) return 'dq';
  if (heelTendency > 0.7 && rand < 0.35) return 'dirty';
  if (winner.personality.anger >= 8 && rand < 0.2) return 'count-out';
  return 'clean';
}

function crowdReaction(winner: Wrestler, finishType: FinishType, rivalryHeat: number): CrowdReaction {
  const excitement = (winner.stats.charisma / 100) + (rivalryHeat / 10);
  if (finishType === 'dq' || finishType === 'no-contest') return 'lukewarm';
  if (excitement > 0.7) return 'hot';
  if (excitement > 0.4) return 'lukewarm';
  return 'dead';
}

export function resolveMatch(
  a: Wrestler,
  b: Wrestler,
  ctx: MatchContext = {}
): MatchResult {
  const scoreA = score(a);
  const scoreB = score(b);
  const total = scoreA + scoreB;
  const rand = Math.random() * total;

  const winner = rand < scoreA ? a : b;
  const loser = winner === a ? b : a;
  const rivalryHeat = ctx.rivalryHeat ?? 0;

  const finishType = pickFinishType(winner, loser, rivalryHeat);
  const reaction = crowdReaction(winner, finishType, rivalryHeat);

  const moments = [
    `${winner.name} dominated early with ${winner.personality.ego >= 7 ? 'arrogant taunts' : 'focused aggression'}.`,
    `${loser.name} fought back but ${finishType === 'clean' ? 'couldn\'t overcome the difference in momentum' : 'the match ended controversially'}.`,
  ];

  return {
    matchId: randomUUID(),
    participants: [a.wrestlerId, b.wrestlerId],
    winner: winner.wrestlerId,
    finishType,
    crowdReaction: reaction,
    moments,
    narration: moments.join(' '),
  };
}
```

- [ ] **Step 4: Run tests**
```bash
pnpm nx test wrastlin-service
```
Expected: all passed

- [ ] **Step 5: Commit**
```bash
git add apps/wrastlin/meta-service/src/storyteller/
git commit -m "feat(wrastlin-service): add deterministic match resolver with tests"
```

---

### Task 13: Show generator

> **Design note:** `showGenerator.ts` returns the `Show` object and updates wrestler state (emotions after show) but does NOT write the show file to disk. The CLI script (`src/generate-show.ts`) is responsible for calling `writeJson` to persist the show. This keeps the generator pure and testable without file I/O.

**Files:**
- Create: `apps/wrastlin/meta-service/src/storyteller/showGenerator.ts`
- Create: `apps/wrastlin/meta-service/src/storyteller/showGenerator.spec.ts`

- [ ] **Step 1: Write failing test**

Create `src/storyteller/showGenerator.spec.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as gameState from '../core/gameState.js';
import { generateShow } from './showGenerator.js';
import type { Wrestler, Manager, WeeklyState, WeeklySubmission } from '@org/wrastlin-shared';

// Minimal seed data for tests
const wrestlers: Wrestler[] = [
  {
    wrestlerId: 'w-a', name: 'Wrestler A', gimmick: 'Face',
    stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
    personality: { ego: 3, anger: 3, honor: 8, loyalty: 7, ambition: 5 },
    emotionalState: { confidence: 7, frustration: 3, fatigue: 3 },
    relationships: [], memories: [], managerTrust: 7,
  },
  {
    wrestlerId: 'w-b', name: 'Wrestler B', gimmick: 'Heel',
    stats: { strength: 75, agility: 65, endurance: 70, charisma: 65 },
    personality: { ego: 8, anger: 7, honor: 2, loyalty: 3, ambition: 8 },
    emotionalState: { confidence: 8, frustration: 4, fatigue: 4 },
    relationships: [], memories: [], managerTrust: 4,
  },
];

const state: WeeklyState = { currentWeek: 1, phase: 'submissions_closed', updatedAt: '' };

beforeEach(() => {
  vi.spyOn(gameState, 'loadWrestlers').mockReturnValue(wrestlers);
  vi.spyOn(gameState, 'loadManagers').mockReturnValue([]);
  vi.spyOn(gameState, 'loadSubmissions').mockReturnValue([]);
  vi.spyOn(gameState, 'loadState').mockReturnValue(state);
  vi.spyOn(gameState, 'saveWrestlers').mockImplementation(() => {});
  vi.spyOn(gameState, 'saveState').mockImplementation(() => {});
});

describe('generateShow', () => {
  it('returns a show with at least one segment', () => {
    const show = generateShow();
    expect(show.segments.length).toBeGreaterThan(0);
  });

  it('has a crowd reaction', () => {
    const show = generateShow();
    expect(['hot', 'lukewarm', 'dead']).toContain(show.crowdReaction);
  });

  it('every match result references valid wrestler ids', () => {
    const ids = new Set(wrestlers.map(w => w.wrestlerId));
    const show = generateShow();
    for (const seg of show.segments) {
      if (seg.matchResult) {
        expect(ids.has(seg.matchResult.winner)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run to confirm failure**
```bash
pnpm nx test wrastlin-service
```
Expected: FAIL

- [ ] **Step 3: Implement `src/storyteller/showGenerator.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { loadWrestlers, loadSubmissions, loadState, saveWrestlers } from '../core/gameState.js';
import { resolveMatch } from './matchResolver.js';
import type { Show, Segment, CrowdReaction, Wrestler } from '@org/wrastlin-shared';

function templateNarration(type: string, participants: string[]): string {
  switch (type) {
    case 'opening-promo':
      return `${participants[0]} opened the show with a fiery promo, setting the tone for the night.`;
    case 'backstage-confrontation':
      return `Tensions boiled over backstage as ${participants[0]} and ${participants[1]} had words.`;
    case 'interview':
      return `${participants[0]} was interviewed about their recent performances.`;
    default:
      return `The crowd watched intently.`;
  }
}

function overallReaction(segments: Segment[]): CrowdReaction {
  const reactions = segments
    .map(s => s.matchResult?.crowdReaction)
    .filter(Boolean) as CrowdReaction[];
  if (reactions.filter(r => r === 'hot').length > reactions.length / 2) return 'hot';
  if (reactions.filter(r => r === 'dead').length > reactions.length / 2) return 'dead';
  return 'lukewarm';
}

function applyPostShowUpdates(wrestlers: Wrestler[], segments: Segment[]): Wrestler[] {
  // After show: winners gain confidence, losers gain frustration
  const updates = new Map<string, Partial<Wrestler['emotionalState']>>();

  for (const seg of segments) {
    if (!seg.matchResult) continue;
    const { winner, participants } = seg.matchResult;
    const loser = participants.find(id => id !== winner);

    const winnerW = wrestlers.find(w => w.wrestlerId === winner);
    if (winnerW) {
      updates.set(winner, {
        confidence: Math.min(10, (winnerW.emotionalState.confidence) + 1),
        frustration: Math.max(1, winnerW.emotionalState.frustration - 1),
      });
    }

    if (loser) {
      const loserW = wrestlers.find(w => w.wrestlerId === loser);
      if (loserW) {
        updates.set(loser, {
          confidence: Math.max(1, loserW.emotionalState.confidence - 1),
          frustration: Math.min(10, loserW.emotionalState.frustration + 1),
        });
      }
    }
  }

  return wrestlers.map(w => {
    const delta = updates.get(w.wrestlerId);
    if (!delta) return w;
    return { ...w, emotionalState: { ...w.emotionalState, ...delta } };
  });
}

export function generateShow(): Show {
  const state = loadState();
  const wrestlers = loadWrestlers();
  const submissions = loadSubmissions(state.currentWeek);
  const segments: Segment[] = [];

  // 1. Opening promo — highest-charisma wrestler
  const [host] = [...wrestlers].sort((a, b) => b.stats.charisma - a.stats.charisma);
  segments.push({
    segmentId: randomUUID(),
    type: 'opening-promo',
    participants: [host.wrestlerId],
    narration: templateNarration('opening-promo', [host.name]),
  });

  // 2. Build match card from available wrestlers (pair them up)
  const available = [...wrestlers];
  const mainEventPair = available.splice(0, 2); // top 2 by total stats for main event

  // Mid-card matches
  while (available.length >= 2) {
    const [a, b] = available.splice(0, 2);

    // Check if any submission asked for this feud
    const feudRequest = submissions.find(
      s => s.storyRequests.some(r =>
        r.type === 'feud' &&
        (r.target === a.wrestlerId || r.target === b.wrestlerId)
      )
    );

    const result = resolveMatch(a, b, { rivalryHeat: feudRequest ? 7 : 0 });
    segments.push({
      segmentId: randomUUID(),
      type: 'singles-match',
      participants: [a.wrestlerId, b.wrestlerId],
      matchResult: result,
      narration: result.narration,
    });
  }

  // 3. Main event
  const [me_a, me_b] = mainEventPair;
  const mainResult = resolveMatch(me_a, me_b, { rivalryHeat: 5 });
  segments.push({
    segmentId: randomUUID(),
    type: 'main-event',
    participants: [me_a.wrestlerId, me_b.wrestlerId],
    matchResult: mainResult,
    narration: `MAIN EVENT: ${mainResult.narration}`,
  });

  // 4. Post-show state updates
  const updatedWrestlers = applyPostShowUpdates(wrestlers, segments);
  saveWrestlers(updatedWrestlers);

  return {
    showId: randomUUID(),
    week: state.currentWeek,
    segments,
    crowdReaction: overallReaction(segments),
    generatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run tests**
```bash
pnpm nx test wrastlin-service
```
Expected: all passed

- [ ] **Step 5: Commit**
```bash
git add apps/wrastlin/meta-service/src/storyteller/
git commit -m "feat(wrastlin-service): add show generator with post-show state updates"
```

---

### Task 14: Show generation CLI

**Files:**
- Modify: `apps/wrastlin/meta-service/src/generate-show.ts`

- [ ] **Step 1: Implement `src/generate-show.ts`**

```typescript
import { generateShow } from './storyteller/showGenerator.js';
import { loadWrestlers, loadState } from './core/gameState.js';
import { transitionTo } from './core/weeklyOrchestrator.js';
import { writeJson } from './data/persistence.js';
import type { Segment } from '@org/wrastlin-shared';

function formatSegment(seg: Segment, wrestlerNames: Map<string, string>): string {
  const names = seg.participants.map(id => wrestlerNames.get(id) ?? id).join(' vs ');
  const lines = [`  [${seg.type.toUpperCase()}] ${names}`];

  if (seg.matchResult) {
    const winner = wrestlerNames.get(seg.matchResult.winner) ?? seg.matchResult.winner;
    lines.push(`    → Winner: ${winner} (${seg.matchResult.finishType})`);
    lines.push(`    → Crowd: ${seg.matchResult.crowdReaction}`);
    lines.push(`    → ${seg.matchResult.narration}`);
  } else {
    lines.push(`    → ${seg.narration}`);
  }

  return lines.join('\n');
}

async function main() {
  const state = loadState();
  if (state.phase !== 'submissions_closed') {
    console.error(`Cannot generate show: phase is '${state.phase}', expected 'submissions_closed'`);
    console.error('Run: curl -X POST http://localhost:3002/state/close-submissions');
    process.exit(1);
  }

  console.log(`\n=== GENERATING SHOW FOR WEEK ${state.currentWeek} ===\n`);

  const show = generateShow();

  const wrestlers = loadWrestlers();
  const nameMap = new Map(wrestlers.map(w => [w.wrestlerId, w.name]));

  console.log(`Show ID: ${show.showId}`);
  console.log(`Week: ${show.week}`);
  console.log(`Overall Crowd: ${show.crowdReaction.toUpperCase()}`);
  console.log('\nSEGMENTS:');
  show.segments.forEach(seg => console.log(formatSegment(seg, nameMap)));

  // Save show (writeJson handles directory creation)
  writeJson(`shows/week-${show.week}.json`, show);
  console.log(`\nShow saved to data/shows/week-${show.week}.json`);

  // Advance state to show_generated
  transitionTo('show_generated');
  console.log(`State advanced to: show_generated`);
  console.log('\nTo start next week: curl -X POST http://localhost:3002/state/advance-week');
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Build**
```bash
pnpm nx build wrastlin-service
```

- [ ] **Step 3: Manual test — full loop**

```bash
# 1. Start server
node apps/wrastlin/meta-service/dist/main.js &

# 2. Submit for manager
curl -X POST http://localhost:3002/submissions \
  -H "Content-Type: application/json" \
  -d '{
    "managerId":"m-001",
    "advice":{"matchStyle":"technical","targetOpponent":"w-001"},
    "storyRequests":[{"type":"feud","target":"w-001","bribeAmount":200}]
  }'

# 3. Close submissions
curl -X POST http://localhost:3002/state/close-submissions

# 4. Run show generation
pnpm nx run wrastlin-service:generate-show
```

Expected output:
```
=== GENERATING SHOW FOR WEEK 1 ===

Show ID: ...
Week: 1
Overall Crowd: HOT|LUKEWARM|DEAD

SEGMENTS:
  [OPENING-PROMO] Dazzle King
    → Dazzle King opened the show...
  [SINGLES-MATCH] Iron Maddox vs Rookie Blaze
    → Winner: Iron Maddox (clean)
    ...
  [MAIN-EVENT] Rex Dominion vs Steel Purity
    → Winner: ...

Show saved to data/shows/week-1.json
State advanced to: show_generated
```

- [ ] **Step 5: Commit**
```bash
git add apps/wrastlin/meta-service/src/generate-show.ts apps/wrastlin/meta-service/src/api/state.ts
git commit -m "feat(wrastlin-service): add show generation CLI script"
```

---

## Chunk 6: Manager UI

**Goal:** Browser app at http://localhost:4300 with wrestler dashboard (stats + chat) and weekly submission form.

### Task 15: API client

**Files:**
- Create: `apps/wrastlin/game/src/api/client.ts`

- [ ] **Step 1: Create `src/api/client.ts`**

```typescript
import type {
  Wrestler,
  Manager,
  WeeklySubmission,
  WeeklyState,
  ManagerAdvice,
  StoryRequest,
} from '@org/wrastlin-shared';

const BASE = '/api'; // proxied to http://localhost:3002 by Vite

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getWrestlers: () => get<Wrestler[]>('/wrestlers'),
  getWrestler: (id: string) => get<Wrestler>(`/wrestlers/${id}`),
  getManager: (id: string) => get<Manager>(`/managers/${id}`),
  chat: (managerId: string, message: string) =>
    post<{ wrestlerName: string; message: string }>(`/managers/${managerId}/chat`, { message }),
  getState: () => get<WeeklyState>('/state'),
  submitWeek: (managerId: string, advice: ManagerAdvice, storyRequests: StoryRequest[]) =>
    post<WeeklySubmission>('/submissions', { managerId, advice, storyRequests }),
  getSubmissions: (week: number) => get<WeeklySubmission[]>(`/submissions/week/${week}`),
};
```

- [ ] **Step 2: Commit**
```bash
git add apps/wrastlin/game/src/api/
git commit -m "feat(wrastlin-game): add typed API client"
```

---

### Task 16: WrestlerCard and ChatPanel components

**Files:**
- Create: `apps/wrastlin/game/src/components/WrestlerCard.tsx`
- Create: `apps/wrastlin/game/src/components/ChatPanel.tsx`

- [ ] **Step 1: Create `src/components/WrestlerCard.tsx`**

```tsx
import type { Wrestler } from '@org/wrastlin-shared';

interface Props {
  wrestler: Wrestler;
}

export function WrestlerCard({ wrestler }: Props) {
  const { name, gimmick, stats, personality, emotionalState, managerTrust } = wrestler;

  return (
    <div style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px' }}>
      <h2>{name}</h2>
      <p><em>{gimmick}</em></p>

      <h3>Stats</h3>
      <ul>
        <li>Strength: {stats.strength}</li>
        <li>Agility: {stats.agility}</li>
        <li>Endurance: {stats.endurance}</li>
        <li>Charisma: {stats.charisma}</li>
      </ul>

      <h3>Personality</h3>
      <ul>
        <li>Ego: {personality.ego}/10</li>
        <li>Anger: {personality.anger}/10</li>
        <li>Honor: {personality.honor}/10</li>
        <li>Loyalty: {personality.loyalty}/10</li>
        <li>Ambition: {personality.ambition}/10</li>
      </ul>

      <h3>Emotional State</h3>
      <ul>
        <li>Confidence: {emotionalState.confidence}/10</li>
        <li>Frustration: {emotionalState.frustration}/10</li>
        <li>Fatigue: {emotionalState.fatigue}/10</li>
      </ul>

      <p><strong>Manager Trust:</strong> {managerTrust}/10</p>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/ChatPanel.tsx`**

```tsx
import { useState } from 'react';
import { api } from '../api/client.js';

interface Message {
  from: 'manager' | 'wrestler';
  text: string;
}

interface Props {
  managerId: string;
  wrestlerName: string;
}

export function ChatPanel({ managerId, wrestlerName }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    if (!input.trim()) return;
    const text = input.trim();
    setInput('');
    setMessages(prev => [...prev, { from: 'manager', text }]);
    setLoading(true);

    try {
      const resp = await api.chat(managerId, text);
      setMessages(prev => [...prev, { from: 'wrestler', text: resp.message }]);
    } catch {
      setMessages(prev => [...prev, { from: 'wrestler', text: '...' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: '1px solid #ccc', padding: '1rem', borderRadius: '8px' }}>
      <h3>Chat with {wrestlerName}</h3>

      <div style={{ height: '300px', overflowY: 'auto', marginBottom: '1rem', padding: '0.5rem', background: '#f9f9f9' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ textAlign: m.from === 'manager' ? 'right' : 'left', margin: '0.5rem 0' }}>
            <span style={{
              display: 'inline-block',
              background: m.from === 'manager' ? '#007bff' : '#e9ecef',
              color: m.from === 'manager' ? 'white' : 'black',
              padding: '0.4rem 0.8rem',
              borderRadius: '12px',
              maxWidth: '80%',
            }}>
              {m.text}
            </span>
          </div>
        ))}
        {loading && <div style={{ color: '#999' }}>...</div>}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Say something to your wrestler..."
          style={{ flex: 1, padding: '0.5rem' }}
        />
        <button onClick={send} disabled={loading}>Send</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**
```bash
git add apps/wrastlin/game/src/components/
git commit -m "feat(wrastlin-game): add WrestlerCard and ChatPanel components"
```

---

### Task 17: WrestlerDashboard and SubmissionForm views

**Files:**
- Create: `apps/wrastlin/game/src/views/WrestlerDashboard.tsx`
- Create: `apps/wrastlin/game/src/views/SubmissionForm.tsx`
- Modify: `apps/wrastlin/game/src/App.tsx`

- [ ] **Step 1: Create `src/views/WrestlerDashboard.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { WrestlerCard } from '../components/WrestlerCard.js';
import { ChatPanel } from '../components/ChatPanel.js';
import type { Wrestler, Manager } from '@org/wrastlin-shared';

const MANAGER_ID = 'm-001'; // hardcoded for solo MVP

export function WrestlerDashboard() {
  const [wrestler, setWrestler] = useState<Wrestler | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getManager(MANAGER_ID)
      .then(m => {
        setManager(m);
        return api.getWrestler(m.wrestlerId);
      })
      .then(setWrestler)
      .catch(e => setError(e.message));
  }, []);

  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (!wrestler || !manager) return <p>Loading...</p>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', padding: '1rem' }}>
      <WrestlerCard wrestler={wrestler} />
      <ChatPanel managerId={manager.managerId} wrestlerName={wrestler.name} />
    </div>
  );
}
```

- [ ] **Step 2: Create `src/views/SubmissionForm.tsx`**

```tsx
import { useState } from 'react';
import { api } from '../api/client.js';
import type { MatchStyle, StoryRequestType } from '@org/wrastlin-shared';

const MANAGER_ID = 'm-001';

const MATCH_STYLES: MatchStyle[] = ['technical', 'brawl', 'high-fly', 'heel', 'face'];
const STORY_TYPES: StoryRequestType[] = ['push', 'feud', 'betrayal', 'title-shot', 'promo'];

export function SubmissionForm() {
  const [matchStyle, setMatchStyle] = useState<MatchStyle>('technical');
  const [targetOpponent, setTargetOpponent] = useState('');
  const [storyType, setStoryType] = useState<StoryRequestType>('feud');
  const [storyTarget, setStoryTarget] = useState('');
  const [bribe, setBribe] = useState(0);
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit() {
    setStatus('submitting');
    try {
      await api.submitWeek(
        MANAGER_ID,
        {
          matchStyle,
          targetOpponent: targetOpponent || undefined,
        },
        storyTarget
          ? [{ type: storyType, target: storyTarget, bribeAmount: bribe }]
          : []
      );
      setStatus('done');
      setMessage('Submission recorded! Good luck this week.');
    } catch (e) {
      setStatus('error');
      setMessage((e as Error).message);
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '500px' }}>
      <h2>Weekly Submission</h2>

      <section>
        <h3>Match Advice</h3>
        <label>
          Preferred style:{' '}
          <select value={matchStyle} onChange={e => setMatchStyle(e.target.value as MatchStyle)}>
            {MATCH_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <br />
        <label>
          Target opponent wrestler ID (optional):{' '}
          <input value={targetOpponent} onChange={e => setTargetOpponent(e.target.value)} placeholder="w-001" />
        </label>
      </section>

      <section style={{ marginTop: '1rem' }}>
        <h3>Story Request (optional)</h3>
        <label>
          Type:{' '}
          <select value={storyType} onChange={e => setStoryType(e.target.value as StoryRequestType)}>
            {STORY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <br />
        <label>
          Target wrestler ID:{' '}
          <input value={storyTarget} onChange={e => setStoryTarget(e.target.value)} placeholder="w-001" />
        </label>
        <br />
        <label>
          Bribe amount: $
          <input type="number" value={bribe} min={0} onChange={e => setBribe(Number(e.target.value))} />
        </label>
      </section>

      <button
        onClick={submit}
        disabled={status === 'submitting' || status === 'done'}
        style={{ marginTop: '1rem', padding: '0.5rem 1.5rem' }}
      >
        {status === 'submitting' ? 'Submitting...' : 'Submit for This Week'}
      </button>

      {message && (
        <p style={{ color: status === 'error' ? 'red' : 'green', marginTop: '0.5rem' }}>
          {message}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update `src/App.tsx` with routing**

```tsx
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { WrestlerDashboard } from './views/WrestlerDashboard.js';
import { SubmissionForm } from './views/SubmissionForm.js';

export default function App() {
  return (
    <BrowserRouter>
      <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '1rem' }}>
        <strong>Wrastlin</strong>
        <Link to="/">My Wrestler</Link>
        <Link to="/submit">Weekly Submission</Link>
      </nav>
      <Routes>
        <Route path="/" element={<WrestlerDashboard />} />
        <Route path="/submit" element={<SubmissionForm />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: Install deps and serve**

Run in a real terminal:
```bash
pnpm install
pnpm nx serve wrastlin-game
```
Also in another terminal:
```bash
node apps/wrastlin/meta-service/dist/main.js
```

- [ ] **Step 5: Manual test in browser**

Visit http://localhost:4300:
- `/` shows wrestler stats card + chat panel, send a message → see a response
- `/submit` shows submission form, fill it out and submit → see success message
- curl `http://localhost:3002/submissions/week/1` confirms submission was saved

- [ ] **Step 6: Commit**
```bash
git add apps/wrastlin/game/src/
git commit -m "feat(wrastlin-game): add WrestlerDashboard and SubmissionForm views with routing"
```

---

## Done

All 7 milestones are now testable:

| Milestone | How to test |
|-----------|-------------|
| 0 Scaffolding | `pnpm nx build wrastlin-service` + `pnpm nx serve wrastlin-game` |
| 1 Types | TypeScript compiles with no errors |
| 2 Server API | `curl http://localhost:3002/wrestlers` |
| 3 Submissions | `curl -X POST http://localhost:3002/submissions ...` |
| 4 Manager UI | http://localhost:4300 — chat + submit form |
| 5 Match Resolver | `pnpm nx test wrastlin-service` |
| 6 Show Generation | `pnpm nx run wrastlin-service:generate-show` |

**Next planning pass (deferred):**
- AI wrestler dialogue (Claude API for real responses)
- Show viewer UI
- Betting system
- Auth / multi-manager support
