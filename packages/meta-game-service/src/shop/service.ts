import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import { getContent } from '../content/loader.js';
import { withFileLock, readJsonFile } from '../storage/file-store.js';
import { atomicWrite } from '../storage/atomic-write.js';
import { auditLog } from '../audit/audit-logger.js';
import type { PurchaseResult, IdempotencyStore } from '../types/shop.js';
import type { PlayerInventory } from '../types/inventory.js';
import { idempotencyKey } from '../storage/idempotency-store.js';

export async function purchase(
  dataDir: string,
  playerId: string,
  offerId: string,
  idemKey: string
): Promise<PurchaseResult> {
  const idempotencyPath = path.join(dataDir, 'idempotency.json');
  const compositeKey = idempotencyKey(playerId, idemKey);

  return withFileLock(idempotencyPath, async () => {
    // 1. Read idempotency store
    const idempotencyStore = await readJsonFile<IdempotencyStore>(idempotencyPath);

    // 2. Idempotent replay
    const existing = idempotencyStore.records[compositeKey];
    if (existing) {
      return existing.result;
    }

    // 3. Look up offer
    const { shopOffers } = getContent();
    const offer = shopOffers[offerId];
    if (!offer) {
      return {
        status: 'offer_not_found',
        transactionId: uuidv4(),
        offerId,
        idempotencyKey: idemKey,
      };
    }

    // 4-8. Inventory update with inner lock
    const inventoryPath = path.join(dataDir, 'inventories', `${playerId}.json`);
    let purchaseStatus: 'success' | 'insufficient_funds' = 'success';

    await withFileLock(inventoryPath, async () => {
      let inv: PlayerInventory;
      try {
        inv = await readJsonFile<PlayerInventory>(inventoryPath);
      } catch {
        inv = { playerId, instances: {}, stacks: {} };
      }

      // 5. Verify funds
      for (const price of offer.price) {
        const have = inv.stacks[price.defId] ?? 0;
        if (have < price.qty) {
          purchaseStatus = 'insufficient_funds';
          return;
        }
      }

      // 6. Deduct price
      for (const price of offer.price) {
        const current = inv.stacks[price.defId] ?? 0;
        const next = current - price.qty;
        if (next === 0) {
          delete inv.stacks[price.defId];
        } else {
          inv.stacks[price.defId] = next;
        }
      }

      // 7. Grant items
      const now = new Date().toISOString();
      for (const grant of offer.grant) {
        if (grant.kind === 'stack') {
          inv.stacks[grant.defId] = (inv.stacks[grant.defId] ?? 0) + grant.qty;
        } else {
          for (let i = 0; i < grant.qty; i++) {
            const itemId = uuidv4();
            inv.instances[itemId] = { itemId, defId: grant.defId, createdAt: now };
          }
        }
      }

      // 8. Atomic write inventory
      await atomicWrite(inventoryPath, inv);
    });

    // Only record success in idempotency store; insufficient_funds allows retry
    const transactionId = uuidv4();
    const result: PurchaseResult = {
      status: purchaseStatus,
      transactionId,
      offerId,
      idempotencyKey: idemKey,
    };

    if (purchaseStatus === 'success') {
      // 9-10. Record idempotency
      idempotencyStore.records[compositeKey] = {
        result,
        playerId,
        createdAt: new Date().toISOString(),
      };
      await atomicWrite(idempotencyPath, idempotencyStore);

      // 11. Audit
      await auditLog(path.join(dataDir, 'audit.jsonl'), {
        action: 'shop.purchase',
        playerId,
        idempotencyKey: idemKey,
        data: { offerId, transactionId },
      });
    }

    return result;
  });
}
