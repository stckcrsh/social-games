import type { RunState, ReconcilePatch, RunResult } from '@org/shared';

export function computeReconcilePatch(state: RunState): ReconcilePatch {
  const { startReceipt } = state;
  const result = state.status as RunResult;

  // On dead/abandoned: consume all escrowed stacks; grant nothing
  // On extracted: no consume (items stay), no grant (loot not wired yet)
  const consumeStacks: Record<string, number> = {};
  if (result === 'dead' || result === 'abandoned') {
    for (const [defId, { qty }] of Object.entries(startReceipt.packed.stacks)) {
      consumeStacks[defId] = qty;
    }
  }

  return {
    runId: state.id,
    escrowId: startReceipt.escrowId,
    playerId: startReceipt.playerId,
    result,
    createdAt: Date.now(),
    consume: { instances: [], stacks: consumeStacks },
    grant: { instances: [], stacks: {} },
    durabilityUpdates: [],
  };
}
