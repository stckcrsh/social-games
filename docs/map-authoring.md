# Map Authoring Reference

This document describes the object layers and custom properties required in every dungeon map TMX file. Open maps in [Tiled](https://www.mapeditor.org/) and add these layers alongside your tile layers.

---

## Object Layers (required names)

The engine reads exactly these layer names. Spelling and case must match exactly.

| Layer name | Purpose |
|---|---|
| `spawns` | Player spawn points |
| `extract` | Extraction / exit point (ends the run) |
| `enemies` | Enemy placements |
| `triggers` | Interactive objects (levers, switches, etc.) |
| `portals` | Map-to-map connections |

All objects in every layer must be **Point** objects (`<point/>` in Tiled — use Insert → Point).

Position is set via two custom integer properties, **not** from the object's pixel coordinates:

| Property | Type | Description |
|---|---|---|
| `gridX` | int | Tile column (0-based) |
| `gridY` | int | Tile row (0-based) |

---

## Layer: `spawns`

One object per spawn point. Every map needs at least a `default` spawn.

| Property | Type | Required | Description |
|---|---|---|---|
| `name` (object name) | string | yes | `"default"` for normal run start; other names referenced by portal `targetEnterId` |
| `gridX` | int | yes | Column |
| `gridY` | int | yes | Row |

```xml
<objectgroup name="spawns">
  <object id="1" name="default">
    <properties>
      <property name="gridX" type="int" value="1"/>
      <property name="gridY" type="int" value="1"/>
    </properties>
    <point/>
  </object>
</objectgroup>
```

---

## Layer: `extract`

A single object. The player steps on this tile to complete the run.

| Property | Type | Required | Description |
|---|---|---|---|
| `name` (object name) | string | yes | Anything (conventionally `"extract"`) |
| `gridX` | int | yes | Column |
| `gridY` | int | yes | Row |

```xml
<objectgroup name="extract">
  <object id="2" name="extract">
    <properties>
      <property name="gridX" type="int" value="18"/>
      <property name="gridY" type="int" value="18"/>
    </properties>
    <point/>
  </object>
</objectgroup>
```

---

## Layer: `enemies`

One object per enemy spawn. The object name becomes the enemy's unique ID.

| Property | Type | Required | Description |
|---|---|---|---|
| `name` (object name) | string | yes | Unique ID (e.g. `"chaser-1"`) |
| `gridX` | int | yes | Spawn column |
| `gridY` | int | yes | Spawn row |
| `aiType` | string | yes | `chase_astar` / `patrol_loop` / `charger` |
| `hp` | int | yes | Max HP (also starting HP) |
| `attackDamage` | int | yes | Damage dealt per attack |
| `aggroRange` | int | yes | Tiles at which enemy notices the player |
| `patrolWaypoints` | string | only for `patrol_loop` | JSON array: `[{"x":3,"y":2},{"x":7,"y":2}]` |

```xml
<objectgroup name="enemies">
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
  <object id="4" name="patroller-1">
    <properties>
      <property name="gridX" type="int" value="5"/>
      <property name="gridY" type="int" value="5"/>
      <property name="aiType" value="patrol_loop"/>
      <property name="hp" type="int" value="8"/>
      <property name="attackDamage" type="int" value="3"/>
      <property name="aggroRange" type="int" value="6"/>
      <property name="patrolWaypoints" value="[{&quot;x&quot;:5,&quot;y&quot;:5},{&quot;x&quot;:9,&quot;y&quot;:5}]"/>
    </properties>
    <point/>
  </object>
</objectgroup>
```

---

## Layer: `triggers`

Interactable objects that the player can activate with `E`. The object name is used as the `triggerPointId` in mechanism definitions.

| Property | Type | Required | Description |
|---|---|---|---|
| `name` (object name) | string | yes | Unique ID (e.g. `"lever-a"`). Referenced by mechanism code. |
| `gridX` | int | yes | Column |
| `gridY` | int | yes | Row |
| `interactableKind` | string | yes | `lever` / `switch` / `dial` / `terminal` |
| `label` | string | yes | Display label shown to the player |
| `stateCount` | int | no | Number of discrete states (default: 2) |

```xml
<objectgroup name="triggers">
  <object id="5" name="lever-a">
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
```

---

## Layer: `portals`

Map-to-map connections. Each portal object has a **`type`** attribute (set in Tiled's object properties, not a custom property) of either `map_exit` or `map_enter`.

### `map_exit` — where the player leaves this map

| Property | Type | Required | Description |
|---|---|---|---|
| `name` (object name) | string | yes | Unique ID (e.g. `"exit-north"`) |
| **`type`** (object type) | string | yes | Must be `map_exit` |
| `gridX` | int | yes | Column of the portal tile |
| `gridY` | int | yes | Row of the portal tile |
| `targetMapId` | string | yes | Preset ID of the destination map |
| `targetEnterId` | string | yes | `name` of the `map_enter` object in the destination map |

### `map_enter` — where arriving players land

| Property | Type | Required | Description |
|---|---|---|---|
| `name` (object name) | string | yes | Must match the `targetEnterId` used by a `map_exit` in another map |
| **`type`** (object type) | string | yes | Must be `map_enter` |
| `gridX` | int | yes | Column |
| `gridY` | int | yes | Row |

### Example bidirectional connection

Map A:
```xml
<objectgroup name="portals">
  <object id="5" name="exit-to-b" type="map_exit">
    <properties>
      <property name="gridX" type="int" value="19"/>
      <property name="gridY" type="int" value="10"/>
      <property name="targetMapId" value="room-b"/>
      <property name="targetEnterId" value="enter-from-a"/>
    </properties>
    <point/>
  </object>
  <object id="6" name="enter-from-b" type="map_enter">
    <properties>
      <property name="gridX" type="int" value="0"/>
      <property name="gridY" type="int" value="10"/>
    </properties>
    <point/>
  </object>
</objectgroup>
```

Map B has a mirror image: a `map_exit` pointing back to Map A, and a `map_enter` named `"enter-from-a"`.

---

## `nameIndex` — mechanism targeting

All named objects across all layers are indexed by name into a lookup table at run-start. Mechanism effects in code can reference objects by name instead of hardcoded coordinates:

```typescript
// In a PresetDef mechanism:
effects: [{ type: 'tile_change', targetName: 'lever-a', to: 'floor' }]
```

This means any object name used in a trigger layer doubles as a coordinate reference for tile-change effects.

---

## Tiled workflow tips

- Set object type (`map_exit` / `map_enter`) in the **Type** field of the Object Properties panel, not as a custom property.
- All custom position properties must use `type="int"` — Tiled will store them as strings otherwise.
- Pixel coordinates shown in Tiled are ignored by the engine. Only `gridX`/`gridY` matter.
- After editing, verify the XML structure is valid before committing (the parser warns on missing `gridX`/`gridY` but will skip the object silently).
