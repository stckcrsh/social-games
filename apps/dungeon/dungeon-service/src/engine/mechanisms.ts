import type { GameEvent, Grid, InteractableDef, RunState, TriggerMatcher } from '@org/shared';
import { getTile } from '@org/shared';

export function evaluateMechanisms(
  s: RunState,
  turnEvents: GameEvent[],
  nameIndex: Record<string, { x: number; y: number }> = {},
): void {
  for (const mechanism of s.mechanisms) {
    // If the mechanism has triggers, at least one must match before checking conditions
    if (mechanism.triggers && mechanism.triggers.length > 0) {
      const triggered = mechanism.triggers.some(m => matchesTrigger(m, turnEvents, s.grid));
      if (!triggered) continue;
    }

    const conditionsMet = mechanism.conditions.every(cond => {
      const def = findInteractableInGrid(s.grid, cond.interactableId);
      return def?.state === cond.state;
    });

    if (conditionsMet === mechanism.satisfied) continue;

    mechanism.satisfied = conditionsMet;
    const effects = conditionsMet ? mechanism.effects : mechanism.resetEffects;

    for (const effect of effects) {
      if (effect.type === 'tile_change') {
        let coords: { x: number; y: number } | null = null;
        if (effect.targetName && nameIndex[effect.targetName]) {
          coords = nameIndex[effect.targetName];
        } else if (effect.x != null && effect.y != null) {
          coords = { x: effect.x, y: effect.y };
        } else if (effect.targetName) {
          console.warn(`[mechanisms] unresolved targetName '${effect.targetName}' — nameIndex not passed`);
        }
        if (!coords) continue;

        const tile = getTile(s.grid, coords.x, coords.y);
        if (!tile) continue;
        const from = tile.type;
        tile.type = effect.to;
        if (from !== effect.to) {
          turnEvents.push({ type: 'tile_changed', x: coords.x, y: coords.y, from, to: effect.to });
        }
      }
    }

    turnEvents.push(conditionsMet
      ? { type: 'mechanism_solved', mechanismId: mechanism.id }
      : { type: 'mechanism_reset',  mechanismId: mechanism.id }
    );
  }
}

function matchesTrigger(matcher: TriggerMatcher, events: GameEvent[], grid: Grid): boolean {
  switch (matcher.kind) {
    case 'interact':
      return events.some(e =>
        e.type === 'interacted' && e.interactableId === matcher.triggerPointId
      );
    case 'item_hit': {
      // Find the interactable's position in the grid by its id
      const pos = findInteractablePos(grid, matcher.triggerPointId);
      if (!pos) return false;
      return events.some(e =>
        e.type === 'item_hit' && e.x === pos.x && e.y === pos.y
      );
    }
    case 'entity_death':
      return events.some(e =>
        e.type === 'death' &&
        (matcher.entityId == null || e.entityId === matcher.entityId)
      );
    case 'explosion': {
      const pos = findInteractablePos(grid, matcher.triggerPointId);
      if (!pos) return false;
      return events.some(e => e.type === 'explosion' && e.x === pos.x && e.y === pos.y);
    }
    case 'turn_elapsed':
      return false; // handled by caller checking overclock
    case 'cross_room':
      return false; // handled by cross-room broadcast (Task 7)
  }
}

function findInteractablePos(grid: Grid, id: string): { x: number; y: number } | null {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x].interactable?.id === id) return { x, y };
    }
  }
  return null;
}

function findInteractableInGrid(grid: Grid, id: string): InteractableDef | null {
  for (const row of grid) {
    for (const tile of row) {
      if (tile.interactable?.id === id) return tile.interactable;
    }
  }
  return null;
}
