export interface RunState {
  id: string;
  player: { hp: number; maxHp: number };
  overclock: number;
  status: 'active' | 'dead' | 'extracted';
}

export type GameEvent =
  | { type: 'move'; entityId: string; to: { x: number; y: number } }
  | { type: 'attack'; attackerId: string; targetId: string; damage: number }
  | { type: 'collision_attack'; attackerId: string; targetId: string; damage: number }
  | { type: 'death'; entityId: string }
  | { type: 'pickup'; entityId: string; item: { id: string; name?: string } }
  | { type: 'noop'; reason: string }
  | { type: 'interacted'; label: string; kind: string; newState: number }
  | { type: 'tile_changed'; x: number; y: number; from: string; to: string }
  | { type: 'mechanism_solved'; mechanismId: string }
  | { type: 'mechanism_reset'; mechanismId: string }
  | { type: 'run_end'; reason: string }
  | { type: 'player_action' }
  | { type: string };
