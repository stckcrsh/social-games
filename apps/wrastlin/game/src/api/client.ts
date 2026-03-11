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
  getState: () => get<WeeklyState>('/state'),
  submitWeek: (managerId: string, advice: ManagerAdvice, storyRequests: StoryRequest[], wrestlerMessage?: string) =>
    post<WeeklySubmission>('/submissions', { managerId, advice, storyRequests, wrestlerMessage }),
  getSubmissions: (week: number) => get<WeeklySubmission[]>(`/submissions/week/${week}`),
};
