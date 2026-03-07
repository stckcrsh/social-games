import type { GameEvent, Grid, InteractableDef, RunState } from '@org/shared';
import { getTile } from '@org/shared';

// TODO(Task 8): pass nameIndex to resolve targetName
export function evaluateMechanisms(s: RunState, turnEvents: GameEvent[]): void {
  for (const mechanism of s.mechanisms) {
    const conditionsMet = mechanism.conditions.every(cond => {
      const def = findInteractableInGrid(s.grid, cond.interactableId);
      return def?.state === cond.state;
    });

    if (conditionsMet === mechanism.satisfied) continue;

    mechanism.satisfied = conditionsMet;
    const effects = conditionsMet ? mechanism.effects : mechanism.resetEffects;

    for (const effect of effects) {
      if (effect.type === 'tile_change') {
        if (effect.x != null && effect.y != null) {
          const tile = getTile(s.grid, effect.x, effect.y);
          if (!tile) continue;
          const from = tile.type;
          tile.type = effect.to;
          if (from !== effect.to) {
            turnEvents.push({ type: 'tile_changed', x: effect.x, y: effect.y, from, to: effect.to });
          }
        } else if (effect.targetName) {
          // targetName resolution requires nameIndex (Task 8) — not yet wired here
          console.warn(`[mechanisms] unresolved targetName '${effect.targetName}' — nameIndex not passed`);
        }
      }
    }

    turnEvents.push(conditionsMet
      ? { type: 'mechanism_solved', mechanismId: mechanism.id }
      : { type: 'mechanism_reset',  mechanismId: mechanism.id }
    );
  }
}

function findInteractableInGrid(grid: Grid, id: string): InteractableDef | null {
  for (const row of grid) {
    for (const tile of row) {
      if (tile.interactable?.id === id) return tile.interactable;
    }
  }
  return null;
}
