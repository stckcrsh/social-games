import { XMLParser } from 'fast-xml-parser';
import { readFileSync } from 'node:fs';
import type { AiType, InteractableKind, Pos } from '@org/shared';

export interface TmxTriggerPoint {
  name: string;
  pos: Pos;
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
  name: string;
  pos: Pos;
}

export interface TmxMapData {
  nameIndex: Record<string, Pos>;
  triggers:  TmxTriggerPoint[];
  enemies:   TmxEnemy[];
  exits:     TmxPortalExit[];
  enters:    TmxPortalEnter[];
  extract:   Pos | null;
  spawns:    TmxSpawn[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['objectgroup', 'object', 'property'].includes(name),
});

// getProps converts TMX property values to their declared types.
// After this conversion, `as number` casts in callers are safe for int-typed properties.
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

      if (pos.x == null || pos.y == null) {
        console.warn(`[tmx-loader] object "${name}" in layer "${layerName}" is missing gridX/gridY — skipping`);
        continue;
      }

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
            hp:    (props['hp'] as number) ?? 10,
            maxHp: (props['hp'] as number) ?? 10, // enemies always spawn at full HP
            attackDamage: (props['attackDamage'] as number) ?? 5,
            aggroRange: (props['aggroRange'] as number) ?? 8,
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
