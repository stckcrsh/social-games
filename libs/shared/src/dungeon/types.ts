export interface Pos { x: number; y: number; }

export type TileType = 'floor' | 'wall' | 'weakWall' | 'door' | 'exit' | 'hazard' | 'interactable';
export interface ItemDrop { id: string; kind: 'scrap' | 'item'; qty: number; }

export interface Effect {
  tag: string;
  power?: number;
  duration?: number;    // undefined = permanent
  sourceId?: string;
}

export type InteractableKind = 'lever' | 'switch' | 'dial' | 'terminal';

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
  x?:          number;    // kept for backwards compat
  y?:          number;
  targetName?: string;    // TMX object name, resolved via nameIndex
  to:          TileType;
}

export type MechanismEffect = TileChangeEffect;

// ─── Trigger system ───────────────────────────────────────────────────────────

export type TriggerMatcher =
  | { kind: 'interact';     triggerPointId: string }
  | { kind: 'item_hit';     triggerPointId: string; itemId?: string }
  | { kind: 'entity_death'; entityId?: string }
  | { kind: 'explosion';    triggerPointId: string }
  | { kind: 'turn_elapsed'; afterTurn: number }
  | { kind: 'cross_room';   sourceMapId: string; triggerPointId: string };

// ─── Room snapshot (non-active rooms within a run) ───────────────────────────

export interface RoomState {
  mapId: string;
  grid: Grid;
  enemies: Entity[];
  mechanisms: MechanismDef[];
  pendingExplosions: Array<{ x: number; y: number; radius: number }>;
}

export interface MechanismDef {
  id:           string;
  triggers?:    TriggerMatcher[];
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

export type Slot = 'A' | 'B';

export interface RunItemState {
  mode?: string;
  cooldown?: number;
  meta?: Record<string, unknown>;
}

export interface PlayerProfile {
  inventory: Record<string, number>;   // itemId → qty (ammo stacks)
  loadout: { slotA: string | null; slotB: string | null; activeSlot: Slot };
}

export interface SlotEntry { itemId: string | null; iconKey: string | null; cooldown: number; }
export interface SlotView  { A: SlotEntry; B: SlotEntry; activeSlot: Slot; }

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
  | { type: 'oil_ignited';              x: number; y: number }
  | { type: 'item_activate';  slot: Slot; itemId: string; dir: Direction }
  | { type: 'item_hit';       entityId: string; amount: number; x: number; y: number }
  | { type: 'item_whiff';     slot: Slot; itemId: string; reason: string }
  | { type: 'item_fail';      slot: Slot; itemId: string; reason: 'no-ammo' | 'cooldown' | 'no-item' }
  | { type: 'mine_placed';    x: number; y: number }
  | { type: 'mine_detonated'; x: number; y: number }
  | { type: 'slot_switched';      slot: Slot }
  | { type: 'item_interact_tile'; itemId: string; interactableId: string; x: number; y: number }
  | { type: 'room_transition'; fromMapId: string; toMapId: string; enterId: string };

export type PlayerAction =
  | { type: 'move'; dir: Direction }
  | { type: 'attack'; dir: Direction }
  | { type: 'dash'; dir: Direction }
  | { type: 'useActive'; dir: Direction }
  | { type: 'switchSlot' }
  | { type: 'interact' }
  | { type: 'wait' };

export interface RunConfig {
  width: number;                        // default 20
  height: number;                       // default 20
  allowDiagonalCornerCutting: boolean;  // default false
  dashDistance: number;                 // default 2
  chargerDashDistance: number;          // default 2
}

export type RunResult = 'extracted' | 'dead' | 'abandoned';

export interface StartReceipt {
  runId: string;
  escrowId?: string;
  playerId?: string;
  preset: string;
  createdAt: number;
  packed: {
    instances: Array<{ runItemId: string; defId: string; sourceItemId?: string }>;
    stacks: Record<string, { qty: number }>;
  };
  capacity: {
    maxSlots: number;
    rules: { ammoMaxStack: number; ammoOccupiesSlots: number };
  };
  metaMode: 'bypass' | 'strict';
}

export interface ReconcilePatch {
  runId: string;
  escrowId?: string;
  playerId?: string;
  result: RunResult;
  createdAt: number;
  consume: {
    instances: string[];
    stacks: Record<string, number>;
  };
  grant: {
    instances: Array<{ defId: string; qty?: number }>;
    stacks: Record<string, number>;
  };
  durabilityUpdates: Array<{ itemId: string; durability: number }>;
  debug?: { notes?: string };
}

export interface RunState {
  id: string;
  currentRoomId: string;
  rooms: Record<string, RoomState>;
  grid: Grid;
  player: Entity;
  enemies: Entity[];    // canonical list; sorted by id at turn-end for next cycle
  overclock: number;
  events: GameEvent[];  // append-only log across all turns
  status: 'active' | 'dead' | 'extracted';
  config: RunConfig;
  mechanisms: MechanismDef[];
  pendingExplosions: Array<{ x: number; y: number; radius: number }>;
  profile: PlayerProfile;
  runItemState: { A: RunItemState; B: RunItemState };
  startReceipt: StartReceipt;
  reconcilePatch?: ReconcilePatch;
}

// ─── Item interfaces ──────────────────────────────────────────────────────────

export interface ActivateContext {
  run: RunState;
  profile: PlayerProfile;
  slot: Slot;
  dir: Direction;
  itemId: string;
  slotState: RunItemState;
}

export interface ActivateResult {
  ok: boolean;
  events: GameEvent[];
  patchSlotState?: Partial<RunItemState>;
}

export type ItemCategory = 'consumable' | 'gear' | 'trinket' | 'material' | 'currency';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface MetaItemDef {
  defId: string;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  stackable: boolean;
  maxStack: number;
  description: string;
  effects: Record<string, unknown>;
  tradeable: boolean;
}

export interface ItemDef {
  id: string;
  name: string;
  ammo?: { itemId: string; perUse: number };
  getIconKey(state: RunItemState): string;
  activate(ctx: ActivateContext): ActivateResult;
}

export interface ItemModule {
  def: ItemDef;
  meta: MetaItemDef;
  ammoItems?: MetaItemDef[];
}
