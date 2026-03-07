import { v4 as uuidv4 } from 'uuid';
import { getContent } from '../content/loader.js';
import { updateInventory, getOrCreateInventory } from '../storage/inventory-store.js';
import type { PlayerInventory, ItemInstance } from '@org/shared';
import type { GrantItemsBody, BurnItemsBody, TransferItemsBody } from './schemas.js';

export async function grantItems(
  dataDir: string,
  body: GrantItemsBody
): Promise<PlayerInventory> {
  const { itemDefs } = getContent();
  const { playerId, items } = body;

  for (const item of items) {
    if (!itemDefs[item.defId]) {
      throw Object.assign(new Error(`Unknown defId: ${item.defId}`), { statusCode: 400 });
    }
  }

  return updateInventory(dataDir, playerId, (inv) => {
    const now = new Date().toISOString();
    for (const item of items) {
      if (item.kind === 'stack') {
        inv.stacks[item.defId] = (inv.stacks[item.defId] ?? 0) + item.qty;
      } else {
        for (let i = 0; i < item.qty; i++) {
          const itemId = uuidv4();
          inv.instances[itemId] = { itemId, defId: item.defId, createdAt: now };
        }
      }
    }
    return inv;
  });
}

export async function burnItems(
  dataDir: string,
  body: BurnItemsBody
): Promise<PlayerInventory> {
  const { playerId, items } = body;

  return updateInventory(dataDir, playerId, (inv) => {
    for (const item of items) {
      if (item.kind === 'stack') {
        const current = inv.stacks[item.defId] ?? 0;
        if (current < item.qty) {
          throw Object.assign(
            new Error(`Insufficient stack for ${item.defId}: have ${current}, need ${item.qty}`),
            { statusCode: 400 }
          );
        }
        const next = current - item.qty;
        if (next === 0) {
          delete inv.stacks[item.defId];
        } else {
          inv.stacks[item.defId] = next;
        }
      } else {
        if (!inv.instances[item.itemId]) {
          throw Object.assign(
            new Error(`Instance ${item.itemId} not found in inventory`),
            { statusCode: 400 }
          );
        }
        delete inv.instances[item.itemId];
      }
    }
    return inv;
  });
}

export async function transferItems(
  dataDir: string,
  body: TransferItemsBody
): Promise<{ from: PlayerInventory; to: PlayerInventory }> {
  const { fromPlayerId, toPlayerId, items } = body;

  // Capture instances data from source before deduction
  const sourceBeforeUpdate = await getOrCreateInventory(dataDir, fromPlayerId);
  const capturedInstances: Record<string, ItemInstance> = {};
  for (const item of items) {
    if (item.kind === 'instance') {
      const inst = sourceBeforeUpdate.instances[item.itemId];
      if (!inst) {
        throw Object.assign(
          new Error(`Instance ${item.itemId} not found in source inventory`),
          { statusCode: 400 }
        );
      }
      capturedInstances[item.itemId] = inst;
    }
  }

  const fromInv = await updateInventory(dataDir, fromPlayerId, (inv) => {
    for (const item of items) {
      if (item.kind === 'stack') {
        const current = inv.stacks[item.defId] ?? 0;
        if (current < item.qty) {
          throw Object.assign(
            new Error(`Insufficient stack for ${item.defId}: have ${current}, need ${item.qty}`),
            { statusCode: 400 }
          );
        }
        const next = current - item.qty;
        if (next === 0) {
          delete inv.stacks[item.defId];
        } else {
          inv.stacks[item.defId] = next;
        }
      } else {
        if (!inv.instances[item.itemId]) {
          throw Object.assign(
            new Error(`Instance ${item.itemId} not found in source inventory`),
            { statusCode: 400 }
          );
        }
        delete inv.instances[item.itemId];
      }
    }
    return inv;
  });

  const toInv = await updateInventory(dataDir, toPlayerId, (inv) => {
    for (const item of items) {
      if (item.kind === 'stack') {
        inv.stacks[item.defId] = (inv.stacks[item.defId] ?? 0) + item.qty;
      } else {
        inv.instances[item.itemId] = capturedInstances[item.itemId]!;
      }
    }
    return inv;
  });

  return { from: fromInv, to: toInv };
}

export async function getInventory(
  dataDir: string,
  playerId: string
): Promise<PlayerInventory> {
  return getOrCreateInventory(dataDir, playerId);
}
