export interface Pos { x: number; y: number; }

export type TileType = 'floor' | 'wall' | 'weakWall' | 'door' | 'exit' | 'hazard' | 'interactable';
export interface ItemDrop { id: string; kind: 'scrap' | 'item'; qty: number; }

export interface Effect {
  tag: string;
  power?: number;
  duration?: number;    // undefined = permanent
  sourceId?: string;
}

export type InteractableKind = 'lever' | 'switch' | 'dial';

export interface InteractableDef {
  id:         string;
  kind:       InteractableKind;
  label:      string;
  state:      number;
  stateCount: number;
}

export interface Tile { type: TileType; items: ItemDrop[]; interactable?: InteractableDef; effects: Effect[]; }
export type Grid = Tile[][];  // grid[y][x], y=row, (0,0) top-left, y+ = south

export interface MechanismCondition {
  interactableId: string;
  state:          number;
}

export interface TileChangeEffect {
  type: 'tile_change';
  x:    number;
  y:    number;
  to:   TileType;
}

export type MechanismEffect = TileChangeEffect;

export interface MechanismDef {
  id:           string;
  conditions:   MechanismCondition[];
  effects:      MechanismEffect[];
  resetEffects: MechanismEffect[];
  satisfied:    boolean;
}

export type AiType = 'chase_astar' | 'patrol_loop' | 'charger';
export interface Entity {
  id: string;
  kind: 'player' | 'enemy';
  pos: Pos;
  hp: number;
  maxHp: number;
  attackDamage: number;
  aiType?: AiType;
  state: Record<string, unknown>;  // AI memory (patrol index, etc.)
}

export type Direction = 'N' | 'E' | 'S' | 'W';

export type GameEvent =
  | { type: 'player_action'; action: PlayerAction }
  | { type: 'move'; entityId: string; from: Pos; to: Pos }
  | { type: 'collision_attack'; attackerId: string; targetId: string; damage: number }
  | { type: 'attack'; attackerId: string; targetId: string; damage: number }
  | { type: 'death'; entityId: string }
  | { type: 'pickup'; entityId: string; item: ItemDrop }
  | { type: 'run_end'; reason: 'dead' | 'extracted' }
  | { type: 'noop'; reason: string }
  | { type: 'interacted';       entityId: string; interactableId: string; kind: InteractableKind; label: string; newState: number }
  | { type: 'tile_changed';     x: number; y: number; from: TileType; to: TileType }
  | { type: 'mechanism_solved'; mechanismId: string }
  | { type: 'mechanism_reset';  mechanismId: string }
  | { type: 'fire_damage';              entityId: string; x: number; y: number; amount: number }
  | { type: 'fire_spread';              fromX: number; fromY: number; toX: number; toY: number }
  | { type: 'explosion';                x: number; y: number; radius: number }
  | { type: 'explosion_wall_destroyed'; x: number; y: number }
  | { type: 'explosion_entity_damage';  entityId: string; x: number; y: number; amount: number }
  | { type: 'oil_ignited';              x: number; y: number };

export type PlayerAction =
  | { type: 'move'; dir: Direction }
  | { type: 'attack'; dir: Direction }
  | { type: 'dash'; dir: Direction }
  | { type: 'useItem'; itemId: string }
  | { type: 'interact' }
  | { type: 'wait' };

export interface RunConfig {
  width: number;                        // default 20
  height: number;                       // default 20
  allowDiagonalCornerCutting: boolean;  // default false
  dashDistance: number;                 // default 2
  chargerDashDistance: number;          // default 2
}

export interface RunState {
  id: string;
  grid: Grid;
  player: Entity;
  enemies: Entity[];    // canonical list; sorted by id at turn-end for next cycle
  overclock: number;
  events: GameEvent[];  // append-only log across all turns
  status: 'active' | 'dead' | 'extracted';
  config: RunConfig;
  mechanisms: MechanismDef[];
  pendingExplosions: Array<{ x: number; y: number; radius: number }>;
}
