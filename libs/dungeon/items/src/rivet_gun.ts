import type { ItemModule } from '@org/shared';
import { DIR_TO_DELTA, inBounds, isWall } from '@org/shared';

export const rivetGunModule: ItemModule = {
  def: {
    id: 'rivet_gun',
    name: 'Rivet Gun',
    ammo: { itemId: 'ammo_rivet', perUse: 1 },
    getIconKey: (s) => (s.cooldown ?? 0) > 0 ? 'rivet_gun_cd' : 'rivet_gun_ready',
    activate({ run, dir, slot, itemId }) {
      const { dx, dy } = DIR_TO_DELTA[dir];
      let tx = run.player.pos.x;
      let ty = run.player.pos.y;
      for (let i = 0; i < 4; i++) {
        tx += dx;
        ty += dy;
        if (!inBounds(run.grid, tx, ty) || isWall(run.grid, tx, ty)) break;
        const target = run.enemies.find(e => e.pos.x === tx && e.pos.y === ty && e.hp > 0);
        if (target) {
          target.hp = Math.max(0, target.hp - 3);
          return {
            ok: true,
            events: [{ type: 'item_hit', entityId: target.id, amount: 3, x: tx, y: ty }],
            patchSlotState: { cooldown: 2 },
          };
        }
      }
      return {
        ok: true,
        events: [{ type: 'item_whiff', slot, itemId, reason: 'no entity in range' }],
        patchSlotState: { cooldown: 2 },
      };
    },
  },
  meta: {
    defId: 'rivet_gun',
    name: 'Rivet Gun',
    category: 'gear',
    rarity: 'uncommon',
    stackable: false,
    maxStack: 1,
    description: 'Fires hardened rivets in a straight line.',
    effects: { damage: 3, range: 4 },
    tradeable: true,
  },
  ammoItems: [
    {
      defId: 'ammo_rivet',
      name: 'Rivet Ammo',
      category: 'material',
      rarity: 'common',
      stackable: true,
      maxStack: 99,
      description: 'Hardened rivets for the rivet gun.',
      effects: {},
      tradeable: true,
    },
  ],
};
