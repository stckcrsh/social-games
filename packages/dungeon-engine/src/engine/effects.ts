import type { Effect, Entity, GameEvent, Tile } from '../models/types.js';
import type { Grid } from '../models/types.js';
import type { RunConfig } from '../models/types.js';
import { neighbors8 } from './grid.js';

export interface EffectRule { unique: boolean; stacks: 'refresh' | 'add' | 'max'; priority: number; }
export type EffectResolver = (x: number, y: number, eff: Effect, ctx: EffectContext) => void;
export interface EffectContext {
  grid: Grid;
  entities: Entity[];
  applyEffect(x: number, y: number, eff: Effect): void;
  removeEffect(x: number, y: number, tag: string): void;
  dealDamage(entityId: string, amount: number): void;
  log(ev: GameEvent): void;
  config: RunConfig;
}

export const EFFECT_RULES: Record<string, EffectRule> = {
  oil:  { unique: true, stacks: 'refresh', priority: 10 },
  fire: { unique: true, stacks: 'refresh', priority: 20 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getEffect(tile: Tile, tag: string): Effect | undefined {
  return tile.effects.find(e => e.tag === tag);
}

export function hasEffect(tile: Tile, tag: string): boolean {
  return tile.effects.some(e => e.tag === tag);
}

export function removeEffect(tile: Tile, tag: string): void {
  tile.effects = tile.effects.filter(e => e.tag !== tag);
}

export function applyEffect(tile: Tile, newEff: Effect): void {
  const rule = EFFECT_RULES[newEff.tag];
  const existing = tile.effects.find(e => e.tag === newEff.tag);

  if (rule?.unique && existing) {
    if (rule.stacks === 'refresh') {
      // undefined = permanent, wins over any finite duration
      if (newEff.duration === undefined || existing.duration === undefined) {
        existing.duration = undefined;
      } else {
        existing.duration = Math.max(existing.duration, newEff.duration);
      }
    } else if (rule.stacks === 'max') {
      existing.power = Math.max(existing.power ?? 1, newEff.power ?? 1);
      if (newEff.duration === undefined || existing.duration === undefined) {
        existing.duration = undefined;
      } else {
        existing.duration = Math.max(existing.duration, newEff.duration);
      }
    } else {
      // 'add'
      existing.power = (existing.power ?? 1) + (newEff.power ?? 1);
      if (newEff.duration === undefined || existing.duration === undefined) {
        existing.duration = undefined;
      } else {
        existing.duration = Math.max(existing.duration, newEff.duration);
      }
    }
  } else {
    tile.effects.push({ ...newEff });
  }
}

export function tickDurations(tile: Tile): void {
  for (const eff of tile.effects) {
    if (eff.duration !== undefined) {
      eff.duration -= 1;
    }
  }
  tile.effects = tile.effects.filter(e => e.duration === undefined || e.duration > 0);
}

// ── Fire resolver ─────────────────────────────────────────────────────────────

function fireResolver(x: number, y: number, eff: Effect, ctx: EffectContext): void {
  const power = eff.power ?? 1;

  // A) Damage all living entities on tile
  for (const e of ctx.entities) {
    if (e.pos.x === x && e.pos.y === y && e.hp > 0) {
      ctx.dealDamage(e.id, power);
      ctx.log({ type: 'fire_damage', entityId: e.id, x, y, amount: power });
    }
  }

  // B) Spread to oil neighbors (N, NE, E, SE, S, SW, W, NW)
  for (const nb of neighbors8(ctx.grid, x, y)) {
    const t = ctx.grid[nb.y][nb.x];
    if (hasEffect(t, 'oil')) {
      ctx.removeEffect(nb.x, nb.y, 'oil');
      ctx.applyEffect(nb.x, nb.y, { tag: 'fire', power: 1, duration: 2 });
      ctx.log({ type: 'fire_spread', fromX: x, fromY: y, toX: nb.x, toY: nb.y });
    }
  }
}

export const EFFECT_RESOLVERS: Record<string, EffectResolver> = {
  fire: fireResolver,
};
