import type { RunState } from './types';

const BASE = import.meta.env.VITE_DUNGEON_API_URL ?? 'http://localhost:3001';

export async function createRun(preset: string): Promise<{ runId: string; state: RunState; render: string }> {
  const res = await fetch(`${BASE}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preset }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
