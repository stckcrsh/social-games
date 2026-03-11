import { describe, it, expect } from 'vitest';
import { EVENT_PHASE } from './eventToPhase.js';

// All event types from GameEvent union in libs/dungeon/shared/src/dungeon/types.ts
const ALL_EVENT_TYPES = [
  'move', 'collision_attack', 'attack', 'death', 'pickup',
  'item_activate', 'item_hit', 'item_whiff', 'item_fail', 'item_interact_tile',
  'interacted', 'tile_changed', 'mechanism_solved', 'mechanism_reset',
  'fire_damage', 'fire_spread', 'explosion', 'explosion_wall_destroyed',
  'explosion_entity_damage', 'oil_ignited', 'mine_placed', 'mine_detonated',
  'slot_switched', 'room_transition', 'run_start', 'run_end', 'noop', 'player_action',
] as const;

const VALID_VALUES = ['action', 'impact', 'consequence', 'cleanup', 'skip'] as const;

describe('EVENT_PHASE', () => {
  it('has a mapping for every known event type', () => {
    for (const type of ALL_EVENT_TYPES) {
      expect(EVENT_PHASE, `missing mapping for "${type}"`).toHaveProperty(type);
    }
  });

  it('maps every event to a valid phase or skip', () => {
    for (const [type, phase] of Object.entries(EVENT_PHASE)) {
      expect(VALID_VALUES, `EVENT_PHASE["${type}"] = "${phase}" is not valid`).toContain(phase);
    }
  });
});
