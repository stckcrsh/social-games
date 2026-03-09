import type { RunState, SlotView, ReconcilePatch } from '@org/shared';

function getDungeonBase(): string {
  return (import.meta as { env: { VITE_DUNGEON_API_URL?: string } }).env.VITE_DUNGEON_API_URL ?? 'http://localhost:8080/api/dungeon';
}

export async function createRun(opts: {
  preset: string;
  profile?: object;
  debug?: boolean;
  playerId?: string;
  metaMode?: 'bypass' | 'strict';
  escrowId?: string;
}): Promise<{ runId: string; state: RunState; render: string; slots?: SlotView; debug?: boolean }> {
  const res = await fetch(`${getDungeonBase()}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getReconcilePatch(runId: string): Promise<ReconcilePatch> {
  const res = await fetch(`${getDungeonBase()}/runs/${runId}/reconcile-patch`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function stepTick(
  runId: string,
  action?: object,
): Promise<{ state: RunState; render: string; slots?: SlotView; turnEvents: unknown[]; error?: string }> {
  const res = await fetch(`${getDungeonBase()}/runs/${runId}/tick`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action ? { action } : {}),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function getWsUrl(runId: string): string {
  const env = (import.meta as { env: { VITE_DUNGEON_WS_URL?: string; VITE_DUNGEON_API_URL?: string } }).env;
  const base = env.VITE_DUNGEON_WS_URL
    ?? env.VITE_DUNGEON_API_URL?.replace(/^http/, 'ws')
    ?? 'ws://localhost:8080/api/dungeon';
  return `${base}/runs/${runId}/ws`;
}
