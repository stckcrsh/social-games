import type { ItemModule } from '@org/shared';
import { DIR_TO_DELTA, getTile } from '@org/shared';

export const remoteMineModule: ItemModule = {
  def: {
    id: 'remote_mine',
    name: 'Remote Mine',
    getIconKey: (s) => s.mode === 'placed' ? 'remote_mine_placed' : 'remote_mine_carried',
    activate({ run, dir, slot, itemId, slotState }) {
      const { dx, dy } = DIR_TO_DELTA[dir];
      if (slotState.mode !== 'placed') {
        // Place
        const tx = run.player.pos.x + dx;
        const ty = run.player.pos.y + dy;
        const tile = getTile(run.grid, tx, ty);
        if (!tile || tile.type !== 'floor') {
          return { ok: false, events: [{ type: 'item_whiff', slot, itemId, reason: 'invalid placement tile' }] };
        }
        if ([run.player, ...run.enemies].some(e => e.pos.x === tx && e.pos.y === ty)) {
          return { ok: false, events: [{ type: 'item_whiff', slot, itemId, reason: 'tile occupied' }] };
        }
        return {
          ok: true,
          events: [{ type: 'mine_placed', x: tx, y: ty }],
          patchSlotState: { mode: 'placed', meta: { minePos: { x: tx, y: ty } }, cooldown: 1 },
        };
      } else {
        // Detonate
        const minePos = slotState.meta?.minePos as { x: number; y: number } | undefined;
        if (!minePos) {
          return { ok: false, events: [{ type: 'item_whiff', slot, itemId, reason: 'no mine data' }] };
        }
        run.pendingExplosions.push({ x: minePos.x, y: minePos.y, radius: 1 });
        return {
          ok: true,
          events: [{ type: 'mine_detonated', x: minePos.x, y: minePos.y }],
          patchSlotState: { mode: undefined, meta: undefined, cooldown: 1 },
        };
      }
    },
  },
  meta: {
    defId: 'remote_mine',
    name: 'Remote Mine',
    category: 'gear',
    rarity: 'uncommon',
    stackable: false,
    maxStack: 1,
    description: 'Place it, then activate again to detonate.',
    effects: { explosionRadius: 1 },
    tradeable: true,
  },
};
