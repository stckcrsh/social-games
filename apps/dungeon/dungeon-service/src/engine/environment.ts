import type { Effect, GameEvent, RunState } from '@org/shared';
import { getTile } from '@org/shared';
import { EFFECT_RESOLVERS, EFFECT_RULES, EffectContext, applyEffect, removeEffect, tickDurations } from './effects.js';
import { resolveExplosions } from './explosions.js';

export function runEnvironmentalPhase(s: RunState, turnEvents: GameEvent[]): void {
  // 1. Explosions first
  resolveExplosions(s, turnEvents);

  // 2. Snapshot all active effects (row-major) before any resolver mutates the grid
  const active: Array<{ x: number; y: number; eff: Effect }> = [];
  for (let gy = 0; gy < s.grid.length; gy++) {
    for (let gx = 0; gx < s.grid[gy].length; gx++) {
      for (const eff of s.grid[gy][gx].effects) {
        active.push({ x: gx, y: gy, eff });
      }
    }
  }

  // 3. Sort: priority ASC, then y ASC, then x ASC, then tag ASC
  active.sort((a, b) => {
    const pa = EFFECT_RULES[a.eff.tag]?.priority ?? 0;
    const pb = EFFECT_RULES[b.eff.tag]?.priority ?? 0;
    if (pa !== pb) return pa - pb;
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return a.x - b.x;
    return a.eff.tag.localeCompare(b.eff.tag);
  });

  // 4. Build context and run resolvers
  const ctx: EffectContext = {
    grid: s.grid,
    entities: [s.player, ...s.enemies.filter(e => e.hp > 0)],
    applyEffect: (x, y, eff) => {
      const t = getTile(s.grid, x, y);
      if (t) applyEffect(t, eff);
    },
    removeEffect: (x, y, tag) => {
      const t = getTile(s.grid, x, y);
      if (t) removeEffect(t, tag);
    },
    dealDamage: (id, amt) => {
      const e = [s.player, ...s.enemies].find(e => e.id === id);
      if (e) e.hp = Math.max(0, e.hp - amt);
    },
    log: ev => turnEvents.push(ev),
    config: s.config,
  };

  for (const { x, y, eff } of active) {
    EFFECT_RESOLVERS[eff.tag]?.(x, y, eff, ctx);
  }

  // 5. Tick durations across all tiles
  for (let gy = 0; gy < s.grid.length; gy++) {
    for (let gx = 0; gx < s.grid[gy].length; gx++) {
      tickDurations(s.grid[gy][gx]);
    }
  }

  // 6. Remove enemies killed by environmental damage; emit death events
  for (const e of s.enemies) {
    if (e.hp <= 0) turnEvents.push({ type: 'death', entityId: e.id });
  }
  s.enemies = s.enemies.filter(e => e.hp > 0);
  if (s.player.hp <= 0) turnEvents.push({ type: 'death', entityId: s.player.id });
}
