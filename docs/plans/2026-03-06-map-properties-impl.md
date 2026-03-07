# Map Properties Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement TMX-property-driven maps with named triggers, per-enemy config, map-to-map portals, extraction points, and multi-room RunState so a single run can traverse multiple connected rooms.

**Architecture:** TMX object layers carry all spatial metadata (triggers, enemies, portals, extract, spawns) with explicit `gridX`/`gridY` custom properties. Server parses object layers into a `TmxMapData` struct at run-start. `RunState` gains `currentRoomId` + `rooms` for frozen non-active rooms; active room state stays top-level for backwards compatibility.

**Tech Stack:** TypeScript, Vitest, `fast-xml-parser` (new dep for TMX parsing), Fastify, `@org/shared`

---

## Context

- Test runner: `pnpm nx test dungeon-service` (runs vitest)
- Run a single test file: `pnpm vitest run src/engine/tmx-loader.spec.ts` (from `apps/dungeon-service/`)
- All tests: `pnpm nx test dungeon-service`
- Shared types live in `libs/shared/src/dungeon/types.ts` — exported via `libs/shared/src/index.ts`
- Existing `makeState()` in `turn.spec.ts` must stay valid throughout — add new fields with defaults
- `pnpm approve-builds` may be needed after adding `fast-xml-parser` — run in a real terminal if pnpm blocks

---

### Task 1: Add new shared types

**Files:**
- Modify: `libs/shared/src/dungeon/types.ts`

**What changes:**
1. Add `RoomState` interface (snapshot of a non-active room)
2. Add `TriggerMatcher` union (what fires a mechanism)
3. Add `triggers` field to `MechanismDef` (alongside existing `conditions` — both can coexist)
4. Update `TileChangeEffect` to support `targetName` in addition to `x,y`
5. Add `currentRoomId` and `rooms` to `RunState`
6. Add `room_transition` GameEvent

**Step 1: Add types to `libs/shared/src/dungeon/types.ts`**

After the `MechanismEffect` type alias, add:

```typescript
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
```

Update `TileChangeEffect` to support named targets:
```typescript
export interface TileChangeEffect {
  type: 'tile_change';
  x?:          number;    // kept for backwards compat; use targetName OR x+y
  y?:          number;
  targetName?: string;    // TMX object name, resolved to {x,y} via nameIndex
  to:          TileType;
}
```

Update `MechanismDef` to add optional triggers:
```typescript
export interface MechanismDef {
  id:           string;
  triggers?:    TriggerMatcher[];   // NEW: what fires this mechanism
  conditions:   MechanismCondition[];
  effects:      MechanismEffect[];
  resetEffects: MechanismEffect[];
  satisfied:    boolean;
}
```

Update `RunState` to add multi-room fields:
```typescript
export interface RunState {
  id: string;
  currentRoomId: string;             // NEW: which room is active
  rooms: Record<string, RoomState>;  // NEW: frozen snapshots of non-active rooms
  grid: Grid;
  player: Entity;
  enemies: Entity[];
  overclock: number;
  events: GameEvent[];
  status: 'active' | 'dead' | 'extracted';
  config: RunConfig;
  mechanisms: MechanismDef[];
  pendingExplosions: Array<{ x: number; y: number; radius: number }>;
  profile: PlayerProfile;
  runItemState: { A: RunItemState; B: RunItemState };
  startReceipt: StartReceipt;
  reconcilePatch?: ReconcilePatch;
}
```

Add `room_transition` to `GameEvent`:
```typescript
| { type: 'room_transition'; fromMapId: string; toMapId: string; enterId: string }
```

**Step 2: Update `makeState()` in `apps/dungeon-service/src/engine/turn.spec.ts`**

Add the two new fields with sensible defaults (so all existing tests still compile):
```typescript
return {
  id: 'run-1',
  currentRoomId: 'room-default',   // ADD THIS
  rooms: {},                        // ADD THIS
  grid,
  // ... rest unchanged
};
```

**Step 3: Verify existing tests still pass**

```bash
cd apps/dungeon-service && pnpm vitest run src/engine/turn.spec.ts
```
Expected: all existing tests PASS (no regressions).

**Step 4: Also update any other test files that construct `RunState` directly**

Search: `grep -r "status: 'active'" apps/dungeon-service/src --include="*.ts" -l`

For each file found, add `currentRoomId: 'room-default', rooms: {}` to the state literal.

**Step 5: Commit**
```bash
git add libs/shared/src/dungeon/types.ts apps/dungeon-service/src/engine/turn.spec.ts
git commit -m "feat: add RoomState, TriggerMatcher, multi-room RunState fields"
```

---

### Task 2: TMX object layer parser

**Files:**
- Create: `apps/dungeon-service/src/engine/tmx-loader.ts`
- Create: `apps/dungeon-service/src/engine/tmx-loader.spec.ts`

**Step 1: Add `fast-xml-parser` dependency**

```bash
cd apps/dungeon-service && pnpm add fast-xml-parser
```

If pnpm blocks with pendingBuilds error, add to root `package.json`:
```json
"pnpm": { "onlyBuiltDependencies": ["@swc/core", "nx", "fast-xml-parser"] }
```
Then run `pnpm approve-builds` in a real terminal.

**Step 2: Define the output types in `apps/dungeon-service/src/engine/tmx-loader.ts`**

```typescript
import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import type { AiType, InteractableKind, Pos, TileType } from '@org/shared';

export interface TmxTriggerPoint {
  name: string;      // unique ID referenced by mechanisms
  pos: Pos;          // grid coordinates
  interactableKind: InteractableKind;
  label: string;
  stateCount: number;
}

export interface TmxEnemy {
  name: string;
  pos: Pos;
  aiType: AiType;
  hp: number;
  maxHp: number;
  attackDamage: number;
  aggroRange: number;
  patrolWaypoints?: Pos[];
}

export interface TmxPortalExit {
  name: string;
  pos: Pos;
  targetMapId: string;
  targetEnterId: string;
}

export interface TmxPortalEnter {
  name: string;
  pos: Pos;
}

export interface TmxSpawn {
  name: string;   // 'default' for normal start
  pos: Pos;
}

export interface TmxMapData {
  nameIndex: Record<string, Pos>;  // all named objects → grid pos
  triggers:  TmxTriggerPoint[];
  enemies:   TmxEnemy[];
  exits:     TmxPortalExit[];
  enters:    TmxPortalEnter[];
  extract:   Pos | null;
  spawns:    TmxSpawn[];
}
```

**Step 3: Write the failing test first**

```typescript
// apps/dungeon-service/src/engine/tmx-loader.spec.ts
import { describe, it, expect } from 'vitest';
import { parseTmxObjects } from './tmx-loader.js';

const MINIMAL_TMX = `<?xml version="1.0" encoding="UTF-8"?>
<map version="1.10" orientation="isometric" width="10" height="10"
     tilewidth="256" tileheight="128">
 <objectgroup name="spawns">
  <object id="1" name="default">
   <properties>
    <property name="gridX" type="int" value="1"/>
    <property name="gridY" type="int" value="2"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
 <objectgroup name="extract">
  <object id="2" name="extract">
   <properties>
    <property name="gridX" type="int" value="8"/>
    <property name="gridY" type="int" value="8"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
 <objectgroup name="triggers">
  <object id="3" name="lever-a">
   <properties>
    <property name="gridX" type="int" value="4"/>
    <property name="gridY" type="int" value="4"/>
    <property name="interactableKind" value="lever"/>
    <property name="label" value="Lever A"/>
    <property name="stateCount" type="int" value="2"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
 <objectgroup name="enemies">
  <object id="4" name="enemy-1">
   <properties>
    <property name="gridX" type="int" value="5"/>
    <property name="gridY" type="int" value="5"/>
    <property name="aiType" value="chase_astar"/>
    <property name="hp" type="int" value="15"/>
    <property name="attackDamage" type="int" value="4"/>
    <property name="aggroRange" type="int" value="8"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
 <objectgroup name="portals">
  <object id="5" name="exit-north" type="map_exit">
   <properties>
    <property name="gridX" type="int" value="9"/>
    <property name="gridY" type="int" value="0"/>
    <property name="targetMapId" value="room-b"/>
    <property name="targetEnterId" value="enter-from-a"/>
   </properties>
   <point/>
  </object>
  <object id="6" name="enter-from-b" type="map_enter">
   <properties>
    <property name="gridX" type="int" value="0"/>
    <property name="gridY" type="int" value="9"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
</map>`;

describe('parseTmxObjects', () => {
  it('parses spawn points', () => {
    const data = parseTmxObjects(MINIMAL_TMX);
    expect(data.spawns).toHaveLength(1);
    expect(data.spawns[0]).toEqual({ name: 'default', pos: { x: 1, y: 2 } });
  });

  it('parses extract point', () => {
    const data = parseTmxObjects(MINIMAL_TMX);
    expect(data.extract).toEqual({ x: 8, y: 8 });
  });

  it('parses trigger points', () => {
    const data = parseTmxObjects(MINIMAL_TMX);
    expect(data.triggers).toHaveLength(1);
    expect(data.triggers[0]).toMatchObject({
      name: 'lever-a',
      pos: { x: 4, y: 4 },
      interactableKind: 'lever',
      label: 'Lever A',
      stateCount: 2,
    });
  });

  it('parses enemies', () => {
    const data = parseTmxObjects(MINIMAL_TMX);
    expect(data.enemies).toHaveLength(1);
    expect(data.enemies[0]).toMatchObject({
      name: 'enemy-1',
      pos: { x: 5, y: 5 },
      aiType: 'chase_astar',
      hp: 15,
      attackDamage: 4,
      aggroRange: 8,
    });
  });

  it('parses portal exits and enters', () => {
    const data = parseTmxObjects(MINIMAL_TMX);
    expect(data.exits).toHaveLength(1);
    expect(data.exits[0]).toMatchObject({
      name: 'exit-north',
      pos: { x: 9, y: 0 },
      targetMapId: 'room-b',
      targetEnterId: 'enter-from-a',
    });
    expect(data.enters).toHaveLength(1);
    expect(data.enters[0]).toMatchObject({ name: 'enter-from-b', pos: { x: 0, y: 9 } });
  });

  it('builds nameIndex from all named objects', () => {
    const data = parseTmxObjects(MINIMAL_TMX);
    expect(data.nameIndex['lever-a']).toEqual({ x: 4, y: 4 });
    expect(data.nameIndex['exit-north']).toEqual({ x: 9, y: 0 });
  });
});
```

**Step 4: Run — confirm it fails**

```bash
cd apps/dungeon-service && pnpm vitest run src/engine/tmx-loader.spec.ts
```
Expected: FAIL — `parseTmxObjects` not found.

**Step 5: Implement `parseTmxObjects` in `tmx-loader.ts`**

```typescript
import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import type { AiType, InteractableKind, Pos } from '@org/shared';
// ... (TmxMapData + sub-types defined above)

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['objectgroup', 'object', 'property'].includes(name),
});

function getProps(obj: Record<string, unknown>): Record<string, unknown> {
  const propsWrapper = obj['properties'] as { property?: unknown[] } | undefined;
  const propList = propsWrapper?.property ?? [];
  const result: Record<string, unknown> = {};
  for (const p of propList as Array<Record<string, unknown>>) {
    const name = p['@_name'] as string;
    const type = p['@_type'] as string | undefined;
    const raw = p['@_value'] as string;
    result[name] = type === 'int' ? parseInt(raw, 10)
                 : type === 'bool' ? raw === 'true'
                 : raw;
  }
  return result;
}

export function parseTmxObjects(tmxContent: string): TmxMapData {
  const doc = parser.parse(tmxContent) as Record<string, unknown>;
  const map = doc['map'] as Record<string, unknown>;
  const groups = (map['objectgroup'] ?? []) as Array<Record<string, unknown>>;

  const result: TmxMapData = {
    nameIndex: {},
    triggers: [],
    enemies: [],
    exits: [],
    enters: [],
    extract: null,
    spawns: [],
  };

  for (const group of groups) {
    const layerName = group['@_name'] as string;
    const objects = (group['object'] ?? []) as Array<Record<string, unknown>>;

    for (const obj of objects) {
      const name = obj['@_name'] as string;
      const type = obj['@_type'] as string | undefined;
      const props = getProps(obj);
      const pos: Pos = { x: props['gridX'] as number, y: props['gridY'] as number };

      result.nameIndex[name] = pos;

      switch (layerName) {
        case 'spawns':
          result.spawns.push({ name, pos });
          break;
        case 'extract':
          result.extract = pos;
          break;
        case 'triggers':
          result.triggers.push({
            name,
            pos,
            interactableKind: props['interactableKind'] as InteractableKind,
            label: props['label'] as string,
            stateCount: (props['stateCount'] as number) ?? 2,
          });
          break;
        case 'enemies':
          result.enemies.push({
            name,
            pos,
            aiType: props['aiType'] as AiType,
            hp: props['hp'] as number ?? 10,
            maxHp: props['hp'] as number ?? 10,
            attackDamage: props['attackDamage'] as number ?? 5,
            aggroRange: props['aggroRange'] as number ?? 8,
            patrolWaypoints: props['patrolWaypoints']
              ? JSON.parse(props['patrolWaypoints'] as string) as Pos[]
              : undefined,
          });
          break;
        case 'portals':
          if (type === 'map_exit') {
            result.exits.push({
              name, pos,
              targetMapId: props['targetMapId'] as string,
              targetEnterId: props['targetEnterId'] as string,
            });
          } else if (type === 'map_enter') {
            result.enters.push({ name, pos });
          }
          break;
      }
    }
  }

  return result;
}

export function loadTmxFile(filePath: string): TmxMapData {
  const content = readFileSync(filePath, 'utf-8');
  return parseTmxObjects(content);
}
```

**Step 6: Run — confirm tests pass**

```bash
cd apps/dungeon-service && pnpm vitest run src/engine/tmx-loader.spec.ts
```
Expected: all 5 tests PASS.

**Step 7: Commit**
```bash
git add apps/dungeon-service/src/engine/tmx-loader.ts apps/dungeon-service/src/engine/tmx-loader.spec.ts
git commit -m "feat: add TMX object layer parser with gridX/gridY properties"
```

---

### Task 3: Enrich open-preset.tmx with object layers

**Files:**
- Modify: `apps/dungeon-ui/public/tiles/open-preset.tmx`

The open preset is a 20×20 map. Looking at the existing tile layer 2 (walls), the wall box is at rows 2–5, cols 5–11. The player spawns at (1,1). There are 2 enemies (chasers). Extract is at (18,18). No portals yet (add one for future multi-room use).

**Step 1: Replace the existing `Object Layer 1` and add proper layers**

Replace the entire `<objectgroup id="3" ...>` block with:

```xml
 <objectgroup id="3" name="spawns">
  <object id="1" name="default">
   <properties>
    <property name="gridX" type="int" value="1"/>
    <property name="gridY" type="int" value="1"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
 <objectgroup id="4" name="extract">
  <object id="2" name="extract">
   <properties>
    <property name="gridX" type="int" value="18"/>
    <property name="gridY" type="int" value="18"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
 <objectgroup id="5" name="enemies">
  <object id="3" name="chaser-1">
   <properties>
    <property name="gridX" type="int" value="8"/>
    <property name="gridY" type="int" value="10"/>
    <property name="aiType" value="chase_astar"/>
    <property name="hp" type="int" value="10"/>
    <property name="attackDamage" type="int" value="5"/>
    <property name="aggroRange" type="int" value="10"/>
   </properties>
   <point/>
  </object>
  <object id="4" name="chaser-2">
   <properties>
    <property name="gridX" type="int" value="15"/>
    <property name="gridY" type="int" value="12"/>
    <property name="aiType" value="chase_astar"/>
    <property name="hp" type="int" value="10"/>
    <property name="attackDamage" type="int" value="5"/>
    <property name="aggroRange" type="int" value="10"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
 <objectgroup id="6" name="portals">
  <object id="5" name="exit-to-corridor" type="map_exit">
   <properties>
    <property name="gridX" type="int" value="19"/>
    <property name="gridY" type="int" value="10"/>
    <property name="targetMapId" value="open-corridor"/>
    <property name="targetEnterId" value="enter-from-open"/>
   </properties>
   <point/>
  </object>
 </objectgroup>
```

Also update `nextlayerid="7"` and `nextobjectid="6"` in the `<map>` tag attributes.

**Step 2: Verify TMX is valid XML**
```bash
node -e "const fs=require('fs'); const {XMLParser}=require('fast-xml-parser'); const p=new XMLParser({ignoreAttributes:false}); p.parse(fs.readFileSync('apps/dungeon-ui/public/tiles/open-preset.tmx','utf-8')); console.log('OK')"
```
Expected: `OK`

**Step 3: Commit**
```bash
git add apps/dungeon-ui/public/tiles/open-preset.tmx
git commit -m "feat: add game metadata object layers to open-preset.tmx"
```

---

### Task 4: Thin PresetDef + update open preset to load from TMX

**Files:**
- Modify: `apps/dungeon-service/src/models/presets.ts`

The `open` preset will be rewritten to load enemies and extract point from the TMX. The string grid is kept for walls/floors — TMX tile layers remain purely visual. Other presets are unchanged.

**Step 1: Add `PresetDef` interface and `tmxPath` support**

At the top of `presets.ts`, add:

```typescript
import { loadTmxFile } from '../engine/tmx-loader.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Resolve TMX path relative to dungeon-ui/public (sibling app in monorepo)
function resolveTmxPath(filename: string): string {
  return resolve(__dirname, '../../../../dungeon-ui/public/tiles', filename);
}
```

**Step 2: Update `open` preset's `buildRunState` to use TMX data**

Find the `open` preset's `buildRunState` (or equivalent factory function). Replace the hardcoded enemy list and exit placement with TMX-loaded data:

```typescript
// In the 'open' preset factory:
const tmx = loadTmxFile(resolveTmxPath('open-preset.tmx'));

// Enemies from TMX:
const enemies: Entity[] = tmx.enemies.map((e, i) => ({
  id: `enemy-${i + 1}`,
  kind: 'enemy' as const,
  pos: e.pos,
  hp: e.hp,
  maxHp: e.maxHp,
  attackDamage: e.attackDamage,
  aiType: e.aiType,
  state: {},
}));

// Player spawn from TMX:
const defaultSpawn = tmx.spawns.find(s => s.name === 'default');
const playerPos = defaultSpawn?.pos ?? { x: 1, y: 1 };

// Extract tile from TMX:
if (tmx.extract) {
  grid[tmx.extract.y][tmx.extract.x].type = 'exit';
}

// Store portal exits on tiles (map_exit type):
for (const exit of tmx.exits) {
  if (grid[exit.pos.y]?.[exit.pos.x]) {
    grid[exit.pos.y][exit.pos.x].type = 'exit'; // reuse 'exit' tile type for now
    // Store the portal metadata on the tile for room transition lookup
    (grid[exit.pos.y][exit.pos.x] as Record<string, unknown>)['portal'] = exit;
  }
}
```

And add `currentRoomId` + `rooms` to the returned `RunState`:
```typescript
return {
  id,
  currentRoomId: 'open',   // map ID = preset ID for single-room runs
  rooms: {},
  grid,
  player: makePlayer(playerPos),
  enemies,
  // ... rest unchanged
};
```

**Step 3: Add `currentRoomId: 'room-default', rooms: {}` to ALL other preset factories**

Search for every `return {` in `presets.ts` that constructs a RunState and add the two new fields.

**Step 4: Run full test suite to check for regressions**

```bash
pnpm nx test dungeon-service
```
Expected: all tests PASS.

**Step 5: Commit**
```bash
git add apps/dungeon-service/src/models/presets.ts
git commit -m "feat: open preset loads enemies and extract from TMX object layers"
```

---

### Task 5: Update mechanisms.ts — TriggerMatcher evaluation

**Files:**
- Modify: `apps/dungeon-service/src/engine/mechanisms.ts`
- Modify: `apps/dungeon-service/src/engine/turn.spec.ts` (new test)

Mechanisms can now fire from game events (not just interactable state). Mechanisms without `triggers` keep their old condition-based behaviour.

**Step 1: Write the failing test**

Add to `turn.spec.ts`:

```typescript
it('mechanism fires on item_hit trigger', () => {
  const grid = makeFloorGrid(10, 10);
  // Place a terminal at (4,4)
  grid[4][4].type = 'interactable';
  grid[4][4].interactable = {
    id: 'terminal-1', kind: 'terminal', label: 'Terminal', state: 0, stateCount: 2,
  };
  // Place a wall that the mechanism will open at (4,5)
  grid[5][4].type = 'wall';

  const state = makeState({
    grid,
    mechanisms: [{
      id: 'mech-terminal',
      triggers: [{ kind: 'item_hit', triggerPointId: 'terminal-1' }],
      conditions: [],
      effects: [{ type: 'tile_change', targetName: 'terminal-1-door', x: 4, y: 5, to: 'floor' }],
      resetEffects: [],
      satisfied: false,
    }],
  });

  // Simulate an item_hit event targeting the terminal
  const { state: s2 } = processTurn(state, { type: 'wait' });
  // Manually inject item_hit into events and re-evaluate mechanisms
  // (In a real turn, this fires from useActive hitting a terminal)
  // For the test, we directly call evaluateMechanisms with the event:
  const { evaluateMechanisms } = await import('./mechanisms.js');
  const events: GameEvent[] = [
    { type: 'item_hit', entityId: 'terminal-1', amount: 0, x: 4, y: 4 },
  ];
  evaluateMechanisms(s2, events);

  expect(s2.grid[5][4].type).toBe('floor');
  expect(events.some(e => e.type === 'mechanism_solved')).toBe(true);
});
```

> Note: `item_hit` currently uses `entityId` not `triggerPointId`. The mechanism matcher checks if any `item_hit` event's `entityId` matches the interactable's ID at the `triggerPointId` position. Adapt as needed.

**Step 2: Run — confirm it fails**
```bash
cd apps/dungeon-service && pnpm vitest run src/engine/turn.spec.ts -t "fires on item_hit"
```

**Step 3: Update `mechanisms.ts`**

The key change: add trigger-event matching alongside the existing condition-based check.

```typescript
import type { GameEvent, Grid, InteractableDef, RunState, TriggerMatcher } from '@org/shared';
import { getTile } from '@org/shared';

function matchesTrigger(matcher: TriggerMatcher, events: GameEvent[], grid: Grid): boolean {
  switch (matcher.kind) {
    case 'interact': {
      return events.some(e =>
        e.type === 'interacted' &&
        e.interactableId === matcher.triggerPointId
      );
    }
    case 'item_hit': {
      // Check if item_hit event targeted the trigger point position
      const pos = findInteractablePos(grid, matcher.triggerPointId);
      if (!pos) return false;
      return events.some(e =>
        e.type === 'item_hit' && e.x === pos.x && e.y === pos.y &&
        (matcher.itemId == null || true)  // itemId filter optional
      );
    }
    case 'entity_death': {
      return events.some(e =>
        e.type === 'death' &&
        (matcher.entityId == null || e.entityId === matcher.entityId)
      );
    }
    case 'explosion': {
      const pos = findInteractablePos(grid, matcher.triggerPointId);
      if (!pos) return false;
      return events.some(e => e.type === 'explosion' && e.x === pos.x && e.y === pos.y);
    }
    case 'turn_elapsed': {
      // Handled by caller passing the overclock value
      return false;
    }
    case 'cross_room': {
      // Handled by cross-room broadcast (Task 8)
      return false;
    }
  }
}

function resolveEffectCoords(effect: import('@org/shared').TileChangeEffect, nameIndex: Record<string, {x:number;y:number}>): {x:number;y:number} | null {
  if (effect.targetName && nameIndex[effect.targetName]) return nameIndex[effect.targetName];
  if (effect.x != null && effect.y != null) return { x: effect.x, y: effect.y };
  return null;
}

export function evaluateMechanisms(
  s: RunState,
  turnEvents: GameEvent[],
  nameIndex: Record<string, {x:number;y:number}> = {},
): void {
  for (const mechanism of s.mechanisms) {
    let conditionsMet: boolean;

    if (mechanism.triggers && mechanism.triggers.length > 0) {
      // Trigger-based: fires when any trigger matcher matches AND conditions hold
      const triggered = mechanism.triggers.some(m => matchesTrigger(m, turnEvents, s.grid));
      if (!triggered) continue;
      conditionsMet = mechanism.conditions.length === 0 ||
        mechanism.conditions.every(cond => {
          const def = findInteractableInGrid(s.grid, cond.interactableId);
          return def?.state === cond.state;
        });
    } else {
      // Legacy condition-based: evaluates every turn
      conditionsMet = mechanism.conditions.every(cond => {
        const def = findInteractableInGrid(s.grid, cond.interactableId);
        return def?.state === cond.state;
      });
    }

    if (conditionsMet === mechanism.satisfied) continue;

    mechanism.satisfied = conditionsMet;
    const effects = conditionsMet ? mechanism.effects : mechanism.resetEffects;

    for (const effect of effects) {
      if (effect.type === 'tile_change') {
        const coords = resolveEffectCoords(effect, nameIndex);
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

function findInteractableInGrid(grid: Grid, id: string): InteractableDef | null {
  for (const row of grid) {
    for (const tile of row) {
      if (tile.interactable?.id === id) return tile.interactable;
    }
  }
  return null;
}

function findInteractablePos(grid: Grid, id: string): {x:number;y:number} | null {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x].interactable?.id === id) return { x, y };
    }
  }
  return null;
}
```

**Step 4: Update callers of `evaluateMechanisms` in `turn.ts`**

The signature gained an optional `nameIndex` parameter — existing calls still compile without it.

**Step 5: Run tests**
```bash
pnpm nx test dungeon-service
```
Expected: all tests PASS including new trigger test.

**Step 6: Commit**
```bash
git add apps/dungeon-service/src/engine/mechanisms.ts apps/dungeon-service/src/engine/turn.spec.ts
git commit -m "feat: mechanisms support TriggerMatcher (item_hit, interact, death, explosion)"
```

---

### Task 6: Multi-room RunState — room transitions

**Files:**
- Modify: `apps/dungeon-service/src/engine/turn.ts`
- Modify: `apps/dungeon-service/src/engine/turn.spec.ts`

When the player steps onto a tile tagged with a `portal` (map_exit), the active room is frozen and the target room is loaded.

**Step 1: Write the failing test**

Add to `turn.spec.ts`:

```typescript
it('transitions to another room when player steps on map_exit tile', () => {
  const grid = makeFloorGrid(5, 5);
  // Place a map_exit tile at (3,1) leading to room-b / enter-from-a
  const exitTile = grid[1][3];
  exitTile.type = 'exit';
  (exitTile as Record<string, unknown>)['portal'] = {
    name: 'exit-east',
    targetMapId: 'room-b',
    targetEnterId: 'enter-from-a',
  };

  // room-b has a 5x5 floor grid with a map_enter at (1,1)
  const roomBGrid = makeFloorGrid(5, 5);
  const roomBEnemy: Entity = makeEnemy('enemy-b1', 3, 3);

  const state = makeState({
    currentRoomId: 'room-a',
    rooms: {
      'room-b': {
        mapId: 'room-b',
        grid: roomBGrid,
        enemies: [roomBEnemy],
        mechanisms: [],
        pendingExplosions: [],
      },
    },
    grid,
    player: { ...makeEnemy('player', 2, 1, 20), kind: 'player', attackDamage: 5 },
  });

  // Move player east to (3,1) — the exit tile
  const { state: s2 } = processTurn(state, { type: 'move', dir: 'E' });

  expect(s2.currentRoomId).toBe('room-b');
  expect(s2.player.pos).toEqual({ x: 1, y: 1 }); // default spawn in room-b
  expect(s2.enemies).toEqual([roomBEnemy]);        // room-b's enemies
  expect(s2.rooms['room-a']).toBeDefined();         // room-a was frozen
  expect(s2.rooms['room-a'].grid[1][3].type).toBe('exit'); // preserved
});
```

**Step 2: Run — confirm it fails**
```bash
cd apps/dungeon-service && pnpm vitest run src/engine/turn.spec.ts -t "transitions to another room"
```

**Step 3: Add room transition logic to `turn.ts`**

After the player move resolves (step 1 of `processTurn`), add a portal check:

```typescript
import type { RoomState } from '@org/shared';

function checkPortalTransition(state: RunState, events: GameEvent[]): void {
  const tile = getTile(state.grid, state.player.pos.x, state.player.pos.y);
  if (!tile) return;

  const portal = (tile as Record<string, unknown>)['portal'] as {
    name: string; targetMapId: string; targetEnterId: string;
  } | undefined;
  if (!portal) return;

  // Freeze current room
  const frozen: RoomState = {
    mapId: state.currentRoomId,
    grid: state.grid,
    enemies: state.enemies,
    mechanisms: state.mechanisms,
    pendingExplosions: state.pendingExplosions,
  };
  state.rooms = { ...state.rooms, [state.currentRoomId]: frozen };

  // Load or create target room
  const targetRoom = state.rooms[portal.targetMapId];
  if (targetRoom) {
    // Returning to a previously visited room
    state.grid = targetRoom.grid;
    state.enemies = targetRoom.enemies;
    state.mechanisms = targetRoom.mechanisms;
    state.pendingExplosions = targetRoom.pendingExplosions;
    // Remove from rooms map (it's now active)
    const { [portal.targetMapId]: _removed, ...rest } = state.rooms;
    state.rooms = rest;
  } else {
    // First visit: engine caller must have pre-populated or we start fresh
    // For now: log a warning and stay (full preset loading is a follow-up)
    console.warn(`[room transition] target room '${portal.targetMapId}' not found in state.rooms`);
    return;
  }

  // Find spawn point in new room
  // The enter point is stored as a tile tag (see Task 4) or falls back to (1,1)
  const enterPos = findEnterPoint(state.grid, portal.targetEnterId) ?? { x: 1, y: 1 };
  state.player = { ...state.player, pos: enterPos };
  state.currentRoomId = portal.targetMapId;

  events.push({
    type: 'room_transition',
    fromMapId: frozen.mapId,
    toMapId: portal.targetMapId,
    enterId: portal.targetEnterId,
  });
}

function findEnterPoint(grid: Grid, enterId: string): Pos | null {
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      const portal = (grid[y][x] as Record<string, unknown>)['portal'] as
        { name: string; type?: string } | undefined;
      if (portal?.name === enterId) return { x, y };
    }
  }
  return null;
}
```

Call `checkPortalTransition(state, turnEvents)` at the end of step 1 (player action resolution), before step 2 (mechanism evaluation).

**Step 4: Run tests**
```bash
pnpm nx test dungeon-service
```
Expected: all tests PASS.

**Step 5: Commit**
```bash
git add apps/dungeon-service/src/engine/turn.ts apps/dungeon-service/src/engine/turn.spec.ts
git commit -m "feat: room transition — freeze active room and swap to target on map_exit step"
```

---

### Task 7: Cross-room trigger evaluation

**Files:**
- Modify: `apps/dungeon-service/src/engine/turn.ts`
- Modify: `apps/dungeon-service/src/engine/turn.spec.ts`

After each turn, trigger events are broadcast to mechanisms in all frozen rooms.

**Step 1: Write the failing test**

```typescript
it('cross-room trigger fires mechanism in a frozen room', () => {
  // Room A (current): player + a lever
  const gridA = makeFloorGrid(5, 5);
  gridA[2][2].type = 'interactable';
  gridA[2][2].interactable = { id: 'lever-a', kind: 'lever', label: 'Lever', state: 0, stateCount: 2 };

  // Room B (frozen): mechanism listening for cross_room trigger from room-a/lever-a
  const gridB = makeFloorGrid(5, 5);
  gridB[3][3].type = 'wall'; // wall that mechanism will open
  const mechB: MechanismDef = {
    id: 'mech-b',
    triggers: [{ kind: 'cross_room', sourceMapId: 'room-a', triggerPointId: 'lever-a' }],
    conditions: [],
    effects: [{ type: 'tile_change', x: 3, y: 3, to: 'floor' }],
    resetEffects: [],
    satisfied: false,
  };

  const state = makeState({
    currentRoomId: 'room-a',
    rooms: {
      'room-b': { mapId: 'room-b', grid: gridB, enemies: [], mechanisms: [mechB], pendingExplosions: [] },
    },
    grid: gridA,
    player: { ...makeEnemy('player', 1, 1, 20), kind: 'player', attackDamage: 5 },
  });

  // Player interacts with lever-a — generates 'interacted' event
  state.grid[1][2].type = 'floor'; // ensure player can be adjacent
  state.player.pos = { x: 1, y: 2 };

  const { state: s2 } = processTurn(state, { type: 'interact' });

  // Mechanism in room-b should have fired
  expect(s2.rooms['room-b'].grid[3][3].type).toBe('floor');
});
```

**Step 2: Run — confirm it fails**
```bash
cd apps/dungeon-service && pnpm vitest run src/engine/turn.spec.ts -t "cross-room trigger"
```

**Step 3: Add cross-room evaluation at end of `processTurn`**

After step 2 (mechanism evaluation for current room) in `processTurn`, add:

```typescript
// Step 2b: Cross-room trigger broadcast
evaluateCrossRoomMechanisms(state, turnEvents);
```

```typescript
function evaluateCrossRoomMechanisms(state: RunState, events: GameEvent[]): void {
  for (const [roomId, room] of Object.entries(state.rooms)) {
    for (const mechanism of room.mechanisms) {
      if (!mechanism.triggers) continue;
      const triggered = mechanism.triggers.some(m => {
        if (m.kind !== 'cross_room') return false;
        if (m.sourceMapId !== state.currentRoomId) return false;
        // Check if the current room's events contain an 'interacted' for this triggerPointId
        return events.some(e =>
          e.type === 'interacted' && e.interactableId === m.triggerPointId
        );
      });
      if (!triggered) continue;
      if (mechanism.satisfied) continue;
      mechanism.satisfied = true;
      for (const effect of mechanism.effects) {
        if (effect.type === 'tile_change' && effect.x != null && effect.y != null) {
          const tile = getTile(room.grid, effect.x, effect.y);
          if (!tile) continue;
          const from = tile.type;
          tile.type = effect.to;
          if (from !== effect.to) {
            events.push({ type: 'tile_changed', x: effect.x, y: effect.y, from, to: effect.to });
          }
        }
      }
      events.push({ type: 'mechanism_solved', mechanismId: mechanism.id });
    }
  }
}
```

**Step 4: Run tests**
```bash
pnpm nx test dungeon-service
```
Expected: all tests PASS.

**Step 5: Commit**
```bash
git add apps/dungeon-service/src/engine/turn.ts apps/dungeon-service/src/engine/turn.spec.ts
git commit -m "feat: cross-room trigger evaluation broadcasts events to frozen room mechanisms"
```

---

### Task 8: Wire `nameIndex` through to mechanisms

**Files:**
- Modify: `apps/dungeon-service/src/models/presets.ts`
- Modify: `apps/dungeon-service/src/engine/turn.ts`

`TileChangeEffect.targetName` only resolves if `nameIndex` is passed to `evaluateMechanisms`. Store the `nameIndex` from TMX parsing in `RunState.config` (or as a separate field).

**Step 1: Add `nameIndex` to `RunConfig` in shared types**

In `libs/shared/src/dungeon/types.ts`, update `RunConfig`:
```typescript
export interface RunConfig {
  width: number;
  height: number;
  allowDiagonalCornerCutting: boolean;
  dashDistance: number;
  chargerDashDistance: number;
  nameIndex?: Record<string, { x: number; y: number }>;  // NEW: from TMX
}
```

**Step 2: Populate `nameIndex` in `open` preset**

After `loadTmxFile(...)` in the open preset factory:
```typescript
const config: RunConfig = {
  ...DEFAULT_CONFIG,
  nameIndex: tmx.nameIndex,
};
```

**Step 3: Pass `nameIndex` to `evaluateMechanisms` in `turn.ts`**

```typescript
evaluateMechanisms(state, turnEvents, state.config.nameIndex ?? {});
```

**Step 4: Run full test suite**
```bash
pnpm nx test dungeon-service
```
Expected: all PASS.

**Step 5: Final commit**
```bash
git add libs/shared/src/dungeon/types.ts apps/dungeon-service/src/models/presets.ts apps/dungeon-service/src/engine/turn.ts
git commit -m "feat: wire nameIndex from TMX through RunConfig to mechanism effect resolution"
```

---

## Completion Checklist

- [ ] `RoomState`, `TriggerMatcher`, updated `MechanismDef`/`RunState` in shared types
- [ ] `parseTmxObjects` parses all 5 object layer types with `gridX`/`gridY` properties
- [ ] `open-preset.tmx` has spawns, extract, enemies, portals object layers
- [ ] Open preset loads enemies + extract from TMX; other presets unchanged
- [ ] Mechanisms fire on `item_hit`, `interact`, `entity_death`, `explosion` events
- [ ] Player stepping on `map_exit` tile freezes current room, loads target
- [ ] Cross-room triggers fire mechanisms in frozen rooms
- [ ] `nameIndex` passed to mechanisms for `targetName` resolution
- [ ] All existing tests pass throughout
