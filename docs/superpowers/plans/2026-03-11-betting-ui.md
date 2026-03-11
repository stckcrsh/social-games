# Betting UI Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a betting UI to the wrastlin React client — three views (`/bets`, `/bets/new`, `/bets/:id`) backed by the already-implemented betting routes in `wrastlin-service`.

**Architecture:** React 18 + Vite app (`apps/wrastlin/game`). Three new view components using existing inline-style conventions. API client extended with `ApiError` class for error-body propagation. Tests use vitest (jsdom) + React Testing Library; the `api` module is mocked with `vi.mock` in every spec file.

**Tech Stack:** React 18, React Router v6, Vite, vitest 3, @testing-library/react, @testing-library/user-event, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-11-betting-ui-design.md`

---

## File Map

| File | Create / Modify | Responsibility |
|------|----------------|----------------|
| `apps/wrastlin/game/package.json` | Modify | Add RTL dev dependencies |
| `apps/wrastlin/game/vite.config.mts` | Modify | Add `test` block (jsdom, globals, setupFiles) |
| `apps/wrastlin/game/tsconfig.app.json` | Modify | Add `@org/betting` project reference |
| `apps/wrastlin/game/project.json` | Modify | Add `test` NX target |
| `apps/wrastlin/game/src/test/setup.ts` | Create | Import `@testing-library/jest-dom` matchers |
| `apps/wrastlin/game/src/api/client.ts` | Modify | `ApiError` class; update `get`/`post` to propagate error body; add 5 betting methods |
| `apps/wrastlin/game/src/api/client.spec.ts` | Create | Unit tests for `ApiError` propagation |
| `apps/wrastlin/game/src/views/BettingList.tsx` | Create | List all propositions, navigate to create/detail |
| `apps/wrastlin/game/src/views/BettingList.spec.tsx` | Create | RTL tests for BettingList |
| `apps/wrastlin/game/src/views/CreateProposition.tsx` | Create | Create-proposition form |
| `apps/wrastlin/game/src/views/CreateProposition.spec.tsx` | Create | RTL tests for CreateProposition |
| `apps/wrastlin/game/src/views/PropositionDetail.tsx` | Create | Pool breakdown + place-bet form |
| `apps/wrastlin/game/src/views/PropositionDetail.spec.tsx` | Create | RTL tests for PropositionDetail |
| `apps/wrastlin/game/src/App.tsx` | Modify | Add three `/bets` routes + "Bets" nav link |

---

## Chunk 1: Infrastructure Setup

### Task 1: Add RTL dependencies and install

**Files:**
- Modify: `apps/wrastlin/game/package.json`

- [ ] **Step 1: Add dev dependencies to package.json**

Merge `devDependencies` into `apps/wrastlin/game/package.json` (preserve existing fields):

```json
{
  "name": "@org/wrastlin-game",
  "version": "0.0.1",
  "private": true,
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.2",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run from your terminal (not Claude Code background — pnpm hangs in non-TTY):

```bash
pnpm install
```

Expected: packages installed, no errors. Verify: `ls apps/wrastlin/game/node_modules/@testing-library/` shows `jest-dom`, `react`, `user-event`.

---

### Task 2: Configure vitest in vite.config.mts

**Files:**
- Modify: `apps/wrastlin/game/vite.config.mts`
- Create: `apps/wrastlin/game/src/test/setup.ts`

- [ ] **Step 1: Add test block to vite.config.mts**

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
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.spec.tsx', 'src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../../../coverage/apps/wrastlin/game',
    },
  },
});
```

- [ ] **Step 2: Create test setup file**

Create `apps/wrastlin/game/src/test/setup.ts`:

```typescript
import '@testing-library/jest-dom';
```

---

### Task 3: Update tsconfig.app.json and project.json

**Files:**
- Modify: `apps/wrastlin/game/tsconfig.app.json`
- Modify: `apps/wrastlin/game/project.json`

- [ ] **Step 1: Add @org/betting reference to tsconfig.app.json**

```json
{
  "extends": "../../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "tsBuildInfoFile": "dist/tsconfig.app.tsbuildinfo",
    "jsx": "react-jsx",
    "lib": ["dom", "es2022"],
    "types": ["node", "vite/client"],
    "rootDir": "src",
    "module": "esnext",
    "moduleResolution": "bundler"
  },
  "exclude": ["dist", "src/**/*.spec.ts", "src/**/*.spec.tsx"],
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "references": [
    { "path": "../../../libs/wrastlin/shared/tsconfig.lib.json" },
    { "path": "../../../libs/shared/betting/tsconfig.lib.json" }
  ]
}
```

- [ ] **Step 2: Add test target to project.json**

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
    },
    "test": {
      "executor": "@nx/vite:test",
      "outputs": ["{workspaceRoot}/coverage/apps/wrastlin/game"],
      "options": {
        "configFile": "apps/wrastlin/game/vite.config.mts"
      }
    }
  },
  "tags": []
}
```

---

### Task 4: Add ApiError and betting methods to client.ts

**Files:**
- Modify: `apps/wrastlin/game/src/api/client.ts`
- Create: `apps/wrastlin/game/src/api/client.spec.ts`

- [ ] **Step 1: Write the failing test for ApiError**

Create `apps/wrastlin/game/src/api/client.spec.ts`:

```typescript
import { api, ApiError } from './client.js';

describe('ApiError propagation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws ApiError with serverMessage from error body on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Insufficient funds' }),
    } as Response);

    await expect(api.getPropositions()).rejects.toMatchObject({
      serverMessage: 'Insufficient funds',
      status: 400,
    });
  });

  it('throws ApiError with generic message when error body has no error field', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response);

    await expect(api.getPropositions()).rejects.toMatchObject({
      serverMessage: 'request failed: 500',
    });
  });

  it('throws ApiError with generic message when error body fails to parse', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 503,
      json: () => Promise.reject(new Error('not json')),
    } as Response);

    await expect(api.getPropositions()).rejects.toMatchObject({
      serverMessage: 'request failed: 503',
    });
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm nx test wrastlin-game
```

Expected: FAIL — `ApiError` not found / `api.getPropositions` not found.

- [ ] **Step 3: Implement ApiError and update client.ts**

Replace `apps/wrastlin/game/src/api/client.ts` with:

```typescript
import type {
  Wrestler,
  Manager,
  WeeklySubmission,
  WeeklyState,
  ManagerAdvice,
  StoryRequest,
} from '@org/wrastlin-shared';
import type { BetProposition, BetPool, BetEntry } from '@org/betting';

const BASE = '/api'; // proxied to http://localhost:3002 by Vite

export class ApiError extends Error {
  constructor(public readonly serverMessage: string, public readonly status: number) {
    super(serverMessage);
    this.name = 'ApiError';
  }
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { error?: string }).error ?? `request failed: ${res.status}`,
      res.status
    );
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(
      (errBody as { error?: string }).error ?? `request failed: ${res.status}`,
      res.status
    );
  }
  return res.json() as Promise<T>;
}

interface CreatePropositionBody {
  createdBy: string;
  question: string;
  options: { optionId: string; label: string }[];
  closesAt: string;
  // always string from UI; backend accepts string | number
  eventKey: string;
}

interface PlaceEntryBody {
  bettorId: string;
  optionId: string;
  amount: number;
}

export const api = {
  // Wrestler / manager
  getWrestlers: () => get<Wrestler[]>('/wrestlers'),
  getWrestler: (id: string) => get<Wrestler>(`/wrestlers/${id}`),
  getManager: (id: string) => get<Manager>(`/managers/${id}`),
  getState: () => get<WeeklyState>('/state'),

  // Submissions
  submitWeek: (managerId: string, advice: ManagerAdvice, storyRequests: StoryRequest[], wrestlerMessage?: string) =>
    post<WeeklySubmission>('/submissions', { managerId, advice, storyRequests, wrestlerMessage }),
  getSubmissions: (week: number) => get<WeeklySubmission[]>(`/submissions/week/${week}`),

  // Betting
  getPropositions: () => get<BetProposition[]>('/bets/propositions'),
  getProposition: (id: string) => get<BetProposition & { pool: BetPool }>(`/bets/propositions/${id}`),
  createProposition: (body: CreatePropositionBody) => post<BetProposition>('/bets/propositions', body),
  placeBet: (propositionId: string, body: PlaceEntryBody) =>
    post<BetEntry>(`/bets/propositions/${propositionId}/entries`, body),
  getMyEntries: (bettorId: string) => get<BetEntry[]>(`/bets/entries?bettorId=${bettorId}`),
};
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm nx test wrastlin-game
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/game/package.json apps/wrastlin/game/vite.config.mts apps/wrastlin/game/tsconfig.app.json apps/wrastlin/game/project.json apps/wrastlin/game/src/test/setup.ts apps/wrastlin/game/src/api/client.ts apps/wrastlin/game/src/api/client.spec.ts
git commit -m "feat(wrastlin-game): add vitest setup, ApiError, and betting API methods"
```

---

## Chunk 2: BettingList View

### Task 5: BettingList — tests and implementation

**Files:**
- Create: `apps/wrastlin/game/src/views/BettingList.tsx`
- Create: `apps/wrastlin/game/src/views/BettingList.spec.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/wrastlin/game/src/views/BettingList.spec.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { BettingList } from './BettingList.js';
import type { BetProposition } from '@org/betting';

vi.mock('../api/client.js', () => ({
  api: { getPropositions: vi.fn() },
}));

const openProp: BetProposition = {
  propositionId: 'prop-1',
  createdBy: 'm-001',
  question: 'Who will win match 1?',
  options: [
    { optionId: 'opt-1', label: 'Rex Dominion' },
    { optionId: 'opt-2', label: 'Iron Mike' },
  ],
  status: 'open',
  closesAt: '2026-03-15T20:00:00.000Z',
  eventKey: '1',
  createdAt: '2026-03-11T10:00:00.000Z',
};

const resolvedProp: BetProposition = {
  ...openProp,
  propositionId: 'prop-2',
  question: 'Will Rex win by KO?',
  status: 'resolved',
  winningOptionIds: ['opt-1'],
};

function renderList() {
  return render(
    <MemoryRouter>
      <BettingList />
    </MemoryRouter>
  );
}

describe('BettingList', () => {
  beforeEach(() => {
    vi.mocked(api.getPropositions).mockResolvedValue([openProp, resolvedProp]);
  });

  it('shows loading state initially', () => {
    renderList();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders proposition questions as links after load', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Who will win match 1?' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Will Rex win by KO?' })).toBeInTheDocument();
    });
  });

  it('each question link points to /bets/:id', async () => {
    renderList();
    await waitFor(() => {
      const link = screen.getByRole('link', { name: 'Who will win match 1?' });
      expect(link).toHaveAttribute('href', '/bets/prop-1');
    });
  });

  it('shows status badge for each proposition', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText(/open/)).toBeInTheDocument();
      expect(screen.getByText(/resolved/)).toBeInTheDocument();
    });
  });

  it('shows closesAt formatted as en-US locale date', async () => {
    renderList();
    const expected = new Date(openProp.closesAt).toLocaleDateString('en-US');
    await waitFor(() => {
      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  });

  it('shows "Create Proposition" button', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Create Proposition' })).toBeInTheDocument();
    });
  });

  it('renders error message when getPropositions rejects', async () => {
    vi.mocked(api.getPropositions).mockRejectedValue(new Error('Network error'));
    renderList();
    await waitFor(() => {
      expect(screen.getByText('Error: Network error')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run — confirm all tests fail**

```bash
pnpm nx test wrastlin-game
```

Expected: FAIL — `BettingList` not found.

- [ ] **Step 3: Implement BettingList.tsx**

Create `apps/wrastlin/game/src/views/BettingList.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import type { BetProposition } from '@org/betting';

export function BettingList() {
  const [propositions, setPropositions] = useState<BetProposition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.getPropositions()
      .then(setPropositions)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (!propositions) return <p>Loading...</p>;

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Betting</h2>
      <button onClick={() => navigate('/bets/new')} style={{ marginBottom: '1rem' }}>
        Create Proposition
      </button>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {propositions.map(p => (
          <li
            key={p.propositionId}
            style={{ marginBottom: '0.5rem', borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}
          >
            <Link to={`/bets/${p.propositionId}`}>{p.question}</Link>
            {' '}
            <span>[{p.status}]</span>
            {' '}
            <span>{new Date(p.closesAt).toLocaleDateString('en-US')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run — confirm all BettingList tests pass**

```bash
pnpm nx test wrastlin-game
```

Expected: All tests pass (3 from client.spec.ts + 7 from BettingList.spec.tsx).

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/game/src/views/BettingList.tsx apps/wrastlin/game/src/views/BettingList.spec.tsx
git commit -m "feat(wrastlin-game): add BettingList view with tests"
```

---

## Chunk 3: CreateProposition View

### Task 6: CreateProposition — tests and implementation

**Files:**
- Create: `apps/wrastlin/game/src/views/CreateProposition.tsx`
- Create: `apps/wrastlin/game/src/views/CreateProposition.spec.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/wrastlin/game/src/views/CreateProposition.spec.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { CreateProposition } from './CreateProposition.js';
import type { BetProposition } from '@org/betting';

const mockNavigate = vi.fn();

vi.mock('../api/client.js', () => ({
  api: { createProposition: vi.fn() },
  ApiError: class ApiError extends Error {
    serverMessage: string;
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.serverMessage = msg;
      this.status = status;
    }
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const fixtureProp: BetProposition = {
  propositionId: 'new-prop-1',
  createdBy: 'm-001',
  question: 'Test question',
  options: [{ optionId: 'opt-1', label: 'A' }, { optionId: 'opt-2', label: 'B' }],
  status: 'open',
  closesAt: '2026-03-20T12:00:00.000Z',
  eventKey: '1',
  createdAt: '2026-03-11T10:00:00.000Z',
};

function renderForm() {
  return render(
    <MemoryRouter>
      <CreateProposition />
    </MemoryRouter>
  );
}

describe('CreateProposition', () => {
  beforeEach(() => {
    vi.mocked(api.createProposition).mockResolvedValue(fixtureProp);
    mockNavigate.mockReset();
  });

  it('renders form with 2 option rows by default', () => {
    renderForm();
    expect(screen.getByLabelText('Option 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Option 2')).toBeInTheDocument();
  });

  it('"Add option" button appends a new row', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Add option' }));
    expect(screen.getByLabelText('Option 3')).toBeInTheDocument();
  });

  it('"Remove" button removes that option row and re-indexes remaining', async () => {
    renderForm();
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await userEvent.click(removeButtons[0]); // remove first option
    // After removal: only one option remains, re-indexed as "Option 1"
    expect(screen.getByLabelText('Option 1')).toBeInTheDocument();
    expect(screen.queryByLabelText('Option 2')).not.toBeInTheDocument();
  });

  it('removing middle option re-indexes remaining options as opt-1, opt-2', async () => {
    renderForm();
    // Add a third option first
    await userEvent.click(screen.getByRole('button', { name: 'Add option' }));
    // Fill them
    await userEvent.type(screen.getByLabelText('Option 1'), 'Alpha');
    await userEvent.type(screen.getByLabelText('Option 2'), 'Beta');
    await userEvent.type(screen.getByLabelText('Option 3'), 'Gamma');
    // Remove middle
    const removeButtons = screen.getAllByRole('button', { name: 'Remove' });
    await userEvent.click(removeButtons[1]);
    // Fill required fields and submit
    await userEvent.type(screen.getByLabelText('Question'), 'A question');
    await userEvent.type(screen.getByLabelText('Event Key'), '1');
    // closesAt - use a valid datetime
    await userEvent.type(screen.getByLabelText('Closes At'), '2026-03-20T12:00');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(vi.mocked(api.createProposition)).toHaveBeenCalledWith(
        expect.objectContaining({
          options: [
            { optionId: 'opt-1', label: 'Alpha' },
            { optionId: 'opt-2', label: 'Gamma' },
          ],
        })
      );
    });
  });

  it('submit calls createProposition with correct shape', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('Question'), 'Who wins?');
    await userEvent.type(screen.getByLabelText('Event Key'), '2');
    await userEvent.type(screen.getByLabelText('Closes At'), '2026-03-20T12:00');
    await userEvent.type(screen.getByLabelText('Option 1'), 'Rex');
    await userEvent.type(screen.getByLabelText('Option 2'), 'Mike');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(vi.mocked(api.createProposition)).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: 'm-001',
          question: 'Who wins?',
          eventKey: '2',
          options: [
            { optionId: 'opt-1', label: 'Rex' },
            { optionId: 'opt-2', label: 'Mike' },
          ],
        })
      );
    });
  });

  it('navigates to /bets/:id using response.propositionId on success', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText('Question'), 'Test');
    await userEvent.type(screen.getByLabelText('Event Key'), '1');
    await userEvent.type(screen.getByLabelText('Closes At'), '2026-03-20T12:00');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/bets/new-prop-1');
    });
  });

  it('shows serverMessage on ApiError response', async () => {
    const { ApiError: Err } = await import('../api/client.js');
    vi.mocked(api.createProposition).mockRejectedValue(
      new Err('Propositions can only be created during week_open phase', 400)
    );
    renderForm();
    await userEvent.type(screen.getByLabelText('Question'), 'Test');
    await userEvent.type(screen.getByLabelText('Event Key'), '1');
    await userEvent.type(screen.getByLabelText('Closes At'), '2026-03-20T12:00');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(
        screen.getByText('Propositions can only be created during week_open phase')
      ).toBeInTheDocument();
    });
  });

  it('shows generic error on non-ApiError failure', async () => {
    vi.mocked(api.createProposition).mockRejectedValue(new Error('Network error'));
    renderForm();
    await userEvent.type(screen.getByLabelText('Question'), 'Test');
    await userEvent.type(screen.getByLabelText('Event Key'), '1');
    await userEvent.type(screen.getByLabelText('Closes At'), '2026-03-20T12:00');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run — confirm all tests fail**

```bash
pnpm nx test wrastlin-game
```

Expected: FAIL — `CreateProposition` not found.

- [ ] **Step 3: Implement CreateProposition.tsx**

Create `apps/wrastlin/game/src/views/CreateProposition.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';

export function CreateProposition() {
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [closesAt, setClosesAt] = useState('');
  const [eventKey, setEventKey] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function addOption() {
    setOptions(prev => [...prev, '']);
  }

  function removeOption(index: number) {
    setOptions(prev => prev.filter((_, i) => i !== index));
  }

  function updateOption(index: number, value: string) {
    setOptions(prev => prev.map((o, i) => (i === index ? value : o)));
  }

  async function submit() {
    setError('');
    setSubmitting(true);
    try {
      const result = await api.createProposition({
        createdBy: 'm-001',
        question,
        closesAt: new Date(closesAt).toISOString(),
        eventKey,
        options: options.map((label, i) => ({ optionId: `opt-${i + 1}`, label })),
      });
      navigate(`/bets/${result.propositionId}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.serverMessage : (e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <div style={{ padding: '1rem', maxWidth: '500px' }}>
      <h2>Create Proposition</h2>

      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="question">Question</label>
        <br />
        <input id="question" value={question} onChange={e => setQuestion(e.target.value)} style={{ width: '100%' }} />
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="closesAt">Closes At</label>
        <br />
        <input id="closesAt" type="datetime-local" value={closesAt} onChange={e => setClosesAt(e.target.value)} />
      </div>

      <div style={{ marginBottom: '0.5rem' }}>
        <label htmlFor="eventKey">Event Key</label>
        <br />
        <input id="eventKey" value={eventKey} onChange={e => setEventKey(e.target.value)} />
      </div>

      <h3>Options</h3>
      {options.map((opt, i) => (
        <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <label htmlFor={`opt-input-${i + 1}`}>Option {i + 1}</label>
          <input
            id={`opt-input-${i + 1}`}
            aria-label={`Option ${i + 1}`}
            value={opt}
            onChange={e => updateOption(i, e.target.value)}
          />
          <button type="button" onClick={() => removeOption(i)}>Remove</button>
        </div>
      ))}
      <button type="button" onClick={addOption} style={{ marginBottom: '1rem' }}>Add option</button>

      <br />
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        style={{ marginTop: '1rem', padding: '0.5rem 1.5rem' }}
      >
        {submitting ? 'Creating...' : 'Create'}
      </button>

      {error && <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run — confirm all tests pass**

```bash
pnpm nx test wrastlin-game
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/game/src/views/CreateProposition.tsx apps/wrastlin/game/src/views/CreateProposition.spec.tsx
git commit -m "feat(wrastlin-game): add CreateProposition view with tests"
```

---

## Chunk 4: PropositionDetail View

### Task 7: PropositionDetail — tests and implementation

**Files:**
- Create: `apps/wrastlin/game/src/views/PropositionDetail.tsx`
- Create: `apps/wrastlin/game/src/views/PropositionDetail.spec.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/wrastlin/game/src/views/PropositionDetail.spec.tsx`:

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import { PropositionDetail } from './PropositionDetail.js';
import type { BetProposition, BetPool, BetEntry } from '@org/betting';
import type { Manager } from '@org/wrastlin-shared';

vi.mock('../api/client.js', () => ({
  api: {
    getProposition: vi.fn(),
    getManager: vi.fn(),
    getMyEntries: vi.fn(),
    placeBet: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    serverMessage: string;
    status: number;
    constructor(msg: string, status: number) {
      super(msg);
      this.serverMessage = msg;
      this.status = status;
    }
  },
}));

const fixtureProposition: BetProposition & { pool: BetPool } = {
  propositionId: 'prop-1',
  createdBy: 'm-001',
  question: 'Who will win match 1?',
  options: [
    { optionId: 'opt-1', label: 'Rex Dominion' },
    { optionId: 'opt-2', label: 'Iron Mike' },
  ],
  status: 'open',
  closesAt: '2026-03-15T20:00:00.000Z',
  eventKey: '1',
  createdAt: '2026-03-11T10:00:00.000Z',
  pool: { totalPot: 150, byOption: { 'opt-1': 100, 'opt-2': 50 } },
};

const fixtureManager: Manager = {
  managerId: 'm-001',
  wrestlerId: 'w-002',
  money: 500,
  trustLevel: 'medium',
};

const fixtureEntry: BetEntry = {
  entryId: 'entry-1',
  propositionId: 'prop-1',
  bettorId: 'm-001',
  optionId: 'opt-1',
  amount: 50,
  placedAt: '2026-03-11T11:00:00.000Z',
};

function renderDetail(propId = 'prop-1') {
  return render(
    <MemoryRouter initialEntries={[`/bets/${propId}`]}>
      <Routes>
        <Route path="/bets/:id" element={<PropositionDetail />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('PropositionDetail', () => {
  beforeEach(() => {
    vi.mocked(api.getProposition).mockResolvedValue(fixtureProposition);
    vi.mocked(api.getManager).mockResolvedValue(fixtureManager);
    vi.mocked(api.getMyEntries).mockResolvedValue([]);
    vi.mocked(api.placeBet).mockResolvedValue(fixtureEntry);
  });

  it('shows loading state initially', () => {
    renderDetail();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders question and status after load', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Who will win match 1?')).toBeInTheDocument();
      expect(screen.getByText(/open/)).toBeInTheDocument();
    });
  });

  it('renders closesAt as en-US locale date', async () => {
    renderDetail();
    const expected = new Date(fixtureProposition.closesAt).toLocaleDateString('en-US');
    await waitFor(() => {
      expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
    });
  });

  it('renders option labels with pool totals', async () => {
    renderDetail();
    await waitFor(() => {
      // Match the exact <li> text to avoid collision with radio button labels
      expect(screen.getByText('Rex Dominion — $100 in pool')).toBeInTheDocument();
      expect(screen.getByText('Iron Mike — $50 in pool')).toBeInTheDocument();
    });
  });

  it('shows manager balance', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Balance: $500')).toBeInTheDocument();
    });
  });

  it('shows existing bet when manager has entry for this proposition', async () => {
    vi.mocked(api.getMyEntries).mockResolvedValue([fixtureEntry]);
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/You bet \$50 on Rex Dominion/)).toBeInTheDocument();
    });
  });

  it('does NOT show existing-bet line for entries on a different proposition', async () => {
    const otherEntry: BetEntry = { ...fixtureEntry, propositionId: 'other-prop', entryId: 'entry-2' };
    vi.mocked(api.getMyEntries).mockResolvedValue([otherEntry]);
    renderDetail();
    await waitFor(() => {
      expect(screen.queryByText(/You bet/)).not.toBeInTheDocument();
    });
  });

  it('renders bet form when status is open', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Rex Dominion/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Place Bet' })).toBeInTheDocument();
    });
  });

  it('does NOT render bet form when status is closed', async () => {
    vi.mocked(api.getProposition).mockResolvedValue({ ...fixtureProposition, status: 'closed' });
    renderDetail();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Place Bet' })).not.toBeInTheDocument();
    });
  });

  it('does NOT render bet form when status is resolved', async () => {
    vi.mocked(api.getProposition).mockResolvedValue({
      ...fixtureProposition,
      status: 'resolved',
      winningOptionIds: ['opt-1'],
    });
    renderDetail();
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Place Bet' })).not.toBeInTheDocument();
    });
  });

  it('calls placeBet with correct args on submit', async () => {
    // Re-fetch returns updated proposition
    vi.mocked(api.getProposition).mockResolvedValue({
      ...fixtureProposition,
      pool: { totalPot: 200, byOption: { 'opt-1': 150, 'opt-2': 50 } },
    });
    renderDetail();
    await waitFor(() => screen.getByRole('radio', { name: /Rex Dominion/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Rex Dominion/ }));
    const amountInput = screen.getByRole('spinbutton');
    await userEvent.clear(amountInput);
    await userEvent.type(amountInput, '75');
    await userEvent.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      expect(vi.mocked(api.placeBet)).toHaveBeenCalledWith('prop-1', {
        bettorId: 'm-001',
        optionId: 'opt-1',
        amount: 75,
      });
    });
  });

  it('re-fetches proposition and entries after successful bet', async () => {
    renderDetail();
    await waitFor(() => screen.getByRole('radio', { name: /Rex Dominion/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Rex Dominion/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      // getProposition called once on mount, once after bet
      expect(vi.mocked(api.getProposition)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(api.getMyEntries)).toHaveBeenCalledTimes(2);
    });
  });

  it('shows serverMessage on ApiError from placeBet', async () => {
    const { ApiError: Err } = await import('../api/client.js');
    vi.mocked(api.placeBet).mockRejectedValue(new Err('Insufficient funds', 400));
    renderDetail();
    await waitFor(() => screen.getByRole('radio', { name: /Rex Dominion/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Rex Dominion/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      expect(screen.getByText('Insufficient funds')).toBeInTheDocument();
    });
  });

  it('shows generic error on non-ApiError failure from placeBet', async () => {
    vi.mocked(api.placeBet).mockRejectedValue(new Error('Network error'));
    renderDetail();
    await waitFor(() => screen.getByRole('radio', { name: /Rex Dominion/ }));
    await userEvent.click(screen.getByRole('radio', { name: /Rex Dominion/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Place Bet' }));
    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('renders error message when initial fetches fail', async () => {
    vi.mocked(api.getProposition).mockRejectedValue(new Error('Server down'));
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('Error: Server down')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run — confirm all tests fail**

```bash
pnpm nx test wrastlin-game
```

Expected: FAIL — `PropositionDetail` not found.

- [ ] **Step 3: Implement PropositionDetail.tsx**

Create `apps/wrastlin/game/src/views/PropositionDetail.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client.js';
import type { BetProposition, BetPool, BetEntry } from '@org/betting';
import type { Manager } from '@org/wrastlin-shared';

const MANAGER_ID = 'm-001';

export function PropositionDetail() {
  const { id } = useParams<{ id: string }>();
  const [proposition, setProposition] = useState<(BetProposition & { pool: BetPool }) | null>(null);
  const [manager, setManager] = useState<Manager | null>(null);
  const [myEntries, setMyEntries] = useState<BetEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState('');
  const [amount, setAmount] = useState(1);
  const [betError, setBetError] = useState('');

  // loadData is defined before useEffect but after all hook declarations
  async function loadData() {
    try {
      const [prop, mgr, allEntries] = await Promise.all([
        api.getProposition(id!),
        api.getManager(MANAGER_ID),
        api.getMyEntries(MANAGER_ID),
      ]);
      setProposition(prop);
      setManager(mgr);
      setMyEntries(allEntries.filter(e => e.propositionId === id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // All hooks must be called unconditionally before any early returns (Rules of Hooks)
  useEffect(() => { if (id) loadData(); }, []);

  // Guard after all hooks
  if (!id) return null;

  async function placeBet() {
    setBetError('');
    try {
      await api.placeBet(id!, { bettorId: MANAGER_ID, optionId: selectedOption, amount });
      // Re-fetch in parallel — no loading state shown
      const [prop, allEntries] = await Promise.all([
        api.getProposition(id!),
        api.getMyEntries(MANAGER_ID),
      ]);
      setProposition(prop);
      setMyEntries(allEntries.filter(e => e.propositionId === id));
    } catch (e) {
      setBetError(e instanceof ApiError ? e.serverMessage : (e as Error).message);
    }
  }

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (!proposition || !manager) return null;

  return (
    <div style={{ padding: '1rem', maxWidth: '600px' }}>
      <h2>{proposition.question}</h2>
      <p>Status: {proposition.status}</p>
      <p>Closes: {new Date(proposition.closesAt).toLocaleDateString('en-US')}</p>

      <h3>Options</h3>
      <ul>
        {proposition.options.map(opt => (
          <li key={opt.optionId}>
            {opt.label} — ${proposition.pool.byOption[opt.optionId] ?? 0} in pool
          </li>
        ))}
      </ul>

      {myEntries.map(entry => {
        const opt = proposition.options.find(o => o.optionId === entry.optionId);
        return (
          <p key={entry.entryId}>
            You bet ${entry.amount} on {opt?.label ?? entry.optionId}
          </p>
        );
      })}

      <p>Balance: ${manager.money}</p>

      {proposition.status === 'open' && (
        <div>
          <h3>Place a Bet</h3>
          {proposition.options.map(opt => (
            <label key={opt.optionId} style={{ display: 'block', marginBottom: '0.25rem' }}>
              <input
                type="radio"
                name="betOption"
                value={opt.optionId}
                checked={selectedOption === opt.optionId}
                onChange={e => setSelectedOption(e.target.value)}
              />
              {' '}{opt.label} (${proposition.pool.byOption[opt.optionId] ?? 0})
            </label>
          ))}
          <div style={{ marginTop: '0.5rem' }}>
            <label htmlFor="betAmount">Amount: $</label>
            <input
              id="betAmount"
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={e => setAmount(parseInt(e.target.value, 10))}
            />
          </div>
          <button
            type="button"
            onClick={placeBet}
            style={{ marginTop: '0.5rem', padding: '0.5rem 1rem' }}
          >
            Place Bet
          </button>
          {betError && <p style={{ color: 'red', marginTop: '0.5rem' }}>{betError}</p>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — confirm all tests pass**

```bash
pnpm nx test wrastlin-game
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/wrastlin/game/src/views/PropositionDetail.tsx apps/wrastlin/game/src/views/PropositionDetail.spec.tsx
git commit -m "feat(wrastlin-game): add PropositionDetail view with tests"
```

---

## Chunk 5: Wire App.tsx

### Task 8: Add routes and nav link

**Files:**
- Modify: `apps/wrastlin/game/src/App.tsx`

- [ ] **Step 1: Merge betting routes and nav link into App.tsx**

Read the current `App.tsx` first, then add the three new imports, the "Bets" `<Link>`, and the three `<Route>` entries. The final file should look like:

```typescript
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { WrestlerDashboard } from './views/WrestlerDashboard.js';
import { SubmissionForm } from './views/SubmissionForm.js';
import { BettingList } from './views/BettingList.js';
import { CreateProposition } from './views/CreateProposition.js';
import { PropositionDetail } from './views/PropositionDetail.js';

export default function App() {
  return (
    <BrowserRouter>
      <nav style={{ padding: '1rem', borderBottom: '1px solid #ccc', display: 'flex', gap: '1rem' }}>
        <strong>Wrastlin</strong>
        <Link to="/">My Wrestler</Link>
        <Link to="/submit">Weekly Submission</Link>
        <Link to="/bets">Bets</Link>
      </nav>
      <Routes>
        <Route path="/" element={<WrestlerDashboard />} />
        <Route path="/submit" element={<SubmissionForm />} />
        <Route path="/bets" element={<BettingList />} />
        <Route path="/bets/new" element={<CreateProposition />} />
        <Route path="/bets/:id" element={<PropositionDetail />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Run full test suite — confirm everything still passes**

```bash
pnpm nx test wrastlin-game
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/wrastlin/game/src/App.tsx
git commit -m "feat(wrastlin-game): wire betting routes and nav link in App"
```

---

## Final Verification

- [ ] Run the full test suite one more time

```bash
pnpm nx test wrastlin-game
```

Expected: All tests pass with no failures.

- [ ] Start the service and manually verify the UI (optional smoke test)

```bash
# In one terminal:
/dev start wrastlin-service
# In another:
pnpm nx serve wrastlin-game
```

Open `http://localhost:4300` — verify "Bets" nav link appears, `/bets` loads, `/bets/new` shows the create form.
