import type { ItemModule } from '@org/shared';
import { DIR_TO_DELTA } from '@org/shared';

export const hammerModule: ItemModule = {
  def: {
    id: 'hammer',
    name: 'Hammer',
    getIconKey: () => 'hammer',
    activate({ run, dir, slot, itemId }) {
      const { dx, dy } = DIR_TO_DELTA[dir];
      const tx = run.player.pos.x + dx;
      const ty = run.player.pos.y + dy;
      const target = run.enemies.find(e => e.pos.x === tx && e.pos.y === ty && e.hp > 0);
      if (!target) {
        return { ok: true, events: [{ type: 'item_whiff', slot, itemId, reason: 'no entity' }] };
      }
      target.hp = Math.max(0, target.hp - 1);
      return { ok: true, events: [{ type: 'item_hit', entityId: target.id, amount: 1, x: tx, y: ty }] };
    },
  },
  meta: {
    defId: 'hammer',
    name: 'Hammer',
    category: 'gear',
    rarity: 'common',
    stackable: false,
    maxStack: 1,
    description: 'A heavy wrench repurposed as a melee weapon.',
    effects: { damage: 1 },
    tradeable: true,
  },
};
