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
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      (body as { error?: string }).error ?? `request failed: ${res.status}`,
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
