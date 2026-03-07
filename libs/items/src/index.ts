import type { Direction, GameEvent, ItemDef, MetaItemDef, PlayerProfile, RunItemState, RunState, Slot, SlotEntry, SlotView } from '@org/shared';
import { hammerModule } from './hammer.js';
import { rivetGunModule } from './rivet_gun.js';
import { remoteMineModule } from './remote_mine.js';
import { shockBatonModule } from './shock_baton.js';

export { hammerModule } from './hammer.js';
export { rivetGunModule } from './rivet_gun.js';
export { remoteMineModule } from './remote_mine.js';
export { shockBatonModule } from './shock_baton.js';

const ALL_ITEMS = [
  hammerModule,
  rivetGunModule,
  remoteMineModule,
  shockBatonModule,
];

export const ITEM_DEFS: Record<string, ItemDef> = Object.fromEntries(
  ALL_ITEMS.map(m => [m.def.id, m.def])
);

export const META_DEFS: Record<string, MetaItemDef> = Object.fromEntries(
  ALL_ITEMS.flatMap(m => [
    [m.meta.defId, m.meta],
    ...(m.ammoItems ?? []).map(a => [a.defId, a]),
  ])
);

function applyPatchSlotState(current: RunItemState, patch: Partial<RunItemState>): RunItemState {
  const next = { ...current, ...patch };
  for (const key of Object.keys(patch) as (keyof RunItemState)[]) {
    if (patch[key] === undefined) delete next[key];
  }
  return next;
}

export function computeSlotView(
  profile: PlayerProfile,
  runItemState: { A: RunItemState; B: RunItemState },
): SlotView {
  function entry(slot: Slot): SlotEntry {
    const itemId = slot === 'A' ? profile.loadout.slotA : profile.loadout.slotB;
    const state  = runItemState[slot];
    const def    = itemId ? ITEM_DEFS[itemId] : undefined;
    return { itemId, iconKey: def ? def.getIconKey(state) : null, cooldown: state.cooldown ?? 0 };
  }
  return { A: entry('A'), B: entry('B'), activeSlot: profile.loadout.activeSlot };
}

export function resolveItemActivation(s: RunState, dir: Direction, turnEvents: GameEvent[]): { error?: string } {
  const slot    = s.profile.loadout.activeSlot;
  const itemId  = slot === 'A' ? s.profile.loadout.slotA : s.profile.loadout.slotB;

  if (!itemId || !ITEM_DEFS[itemId]) {
    turnEvents.push({ type: 'item_fail', slot, itemId: itemId ?? '', reason: 'no-item' });
    return {};
  }

  const def       = ITEM_DEFS[itemId];
  const slotState = s.runItemState[slot];

  if ((slotState.cooldown ?? 0) > 0) {
    turnEvents.push({ type: 'item_fail', slot, itemId, reason: 'cooldown' });
    return {};
  }

  if (def.ammo) {
    const qty = s.profile.inventory[def.ammo.itemId] ?? 0;
    if (qty < def.ammo.perUse) {
      turnEvents.push({ type: 'item_fail', slot, itemId, reason: 'no-ammo' });
      return {};
    }
    s.profile.inventory[def.ammo.itemId] = qty - def.ammo.perUse;
  }

  turnEvents.push({ type: 'item_activate', slot, itemId, dir });
  const result = def.activate({ run: s, profile: s.profile, slot, dir, itemId, slotState });
  turnEvents.push(...result.events);

  if (result.patchSlotState) {
    s.runItemState[slot] = applyPatchSlotState(slotState, result.patchSlotState);
  }
  return {};
}
