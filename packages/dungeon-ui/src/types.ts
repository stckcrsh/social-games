export type TileType = 'floor' | 'wall' | 'weakWall' | 'door' | 'exit' | 'hazard' | 'interactable';

export interface Effect {
  tag: string;
  power?: number;
  duration?: number;
  sourceId?: string;
}

export interface ItemDrop {
  id: string;
  kind: 'scrap' | 'item';
  qty: number;
}

export interface InteractableDef {
  id: string;
  kind: 'lever' | 'switch' | 'dial';
  label: string;
  state: number;
  stateCount: number;
}

export interface Tile {
  type: TileType;
  items: ItemDrop[];
  interactable?: InteractableDef;
  effects: Effect[];
}

export interface Pos {
  x: number;
  y: number;
}

export interface PlayerState {
  hp: number;
  maxHp: number;
  pos: Pos;
}

export interface EnemyState {
  id: string;
  pos: Pos;
  aiType?: string;
  hp: number;
  maxHp: number;
}

export interface RunState {
  id: string;
  grid: Tile[][];
  player: PlayerState;
  enemies: EnemyState[];
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
  | { type: 'fire_damage'; entityId: string; x: number; y: number; amount: number }
  | { type: 'fire_spread'; fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'explosion'; x: number; y: number; radius: number }
  | { type: 'explosion_wall_destroyed'; x: number; y: number }
  | { type: 'explosion_entity_damage'; entityId: string; x: number; y: number; amount: number }
  | { type: 'oil_ignited'; x: number; y: number }
  | { type: string };
