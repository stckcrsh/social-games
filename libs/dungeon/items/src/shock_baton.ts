import type { GameEvent, ItemModule } from '@org/shared';
import { DIR_TO_DELTA, entityAt, getTile } from '@org/shared';

export const shockBatonModule: ItemModule = {
  def: {
    id: 'shock_baton',
    name: 'Shock Baton',
    getIconKey: () => 'shock_baton',
    activate({ run, dir, slot, itemId }) {
      const { dx, dy } = DIR_TO_DELTA[dir];
      const tx = run.player.pos.x + dx;
      const ty = run.player.pos.y + dy;

      // Hit enemy entity
      const target = entityAt(run.enemies, tx, ty);
      if (target) {
        target.hp = Math.max(0, target.hp - 4);
        const events: GameEvent[] = [{ type: 'item_hit', entityId: target.id, amount: 4, x: tx, y: ty }];
        if (target.hp <= 0) events.push({ type: 'death', entityId: target.id });
        return { ok: true, events };
      }

      // Hit interactable tile — advance its state
      const tile = getTile(run.grid, tx, ty);
      if (tile?.type === 'interactable' && tile.interactable) {
        const def = tile.interactable;
        def.state = (def.state + 1) % def.stateCount;
        return {
          ok: true,
          events: [{ type: 'item_interact_tile', itemId, interactableId: def.id, x: tx, y: ty }],
        };
      }

      return { ok: true, events: [{ type: 'item_whiff', slot, itemId, reason: 'nothing to shock' }] };
    },
  },
  meta: {
    defId: 'shock_baton',
    name: 'Shock Baton',
    category: 'gear',
    rarity: 'uncommon',
    stackable: false,
    maxStack: 1,
    description: 'An electric melee weapon. Damages enemies and activates powered terminals.',
    effects: { damage: 4, electric: true },
    tradeable: true,
  },
};
