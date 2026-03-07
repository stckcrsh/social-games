import { createHash } from 'node:crypto';
import path from 'node:path';
import { withFileLock, readJsonFile } from '../storage/file-store.js';
import { atomicWrite } from '../storage/atomic-write.js';
import { auditLog } from '../audit/audit-logger.js';
import type { PlayerInventory } from '@org/shared';
import type { ReconcilePatchInput } from './schemas.js';

interface EscrowResolveRecord {
  escrowId: string;
  resolvedAt: number;
  runId: string;
  result: string;
  patchHash: string;
}

interface EscrowResolveStore {
  records: Record<string, EscrowResolveRecord>;
}

function computePatchHash(patch: ReconcilePatchInput): string {
  const hashInput = JSON.stringify({
    runId: patch.runId,
    result: patch.result,
    consume: patch.consume,
    grant: patch.grant,
  });
  return createHash('sha256').update(hashInput).digest('hex').slice(0, 16);
}

export async function resolveEscrow(
  dataDir: string,
  patch: ReconcilePatchInput & { escrowId: string },
): Promise<{ status: 'ok' | 'deduped' }> {
  const patchHash = computePatchHash(patch);
  const resolvesPath = path.join(dataDir, 'escrow_resolves.json');

  return withFileLock(resolvesPath, async () => {
    const store = await readJsonFile<EscrowResolveStore>(resolvesPath);

    const existing = store.records[patch.escrowId];
    if (existing) {
      if (existing.patchHash === patchHash) {
        await auditLog(path.join(dataDir, 'audit.jsonl'), {
          action: 'run.resolve_dedup',
          playerId: patch.playerId ?? 'unknown',
          data: { escrowId: patch.escrowId, runId: patch.runId, result: patch.result },
        });
        return { status: 'deduped' };
      }
      const err = new Error('Escrow already resolved with different patch') as Error & { statusCode: number };
      err.statusCode = 409;
      throw err;
    }

    if (patch.playerId) {
      const inventoryPath = path.join(dataDir, 'inventories', `${patch.playerId}.json`);
      await withFileLock(inventoryPath, async () => {
        let inv: PlayerInventory;
        try {
          inv = await readJsonFile<PlayerInventory>(inventoryPath);
        } catch {
          inv = { playerId: patch.playerId!, instances: {}, stacks: {} };
        }

        for (const [defId, qty] of Object.entries(patch.consume.stacks)) {
          const current = inv.stacks[defId] ?? 0;
          const next = current - qty;
          if (next <= 0) {
            delete inv.stacks[defId];
          } else {
            inv.stacks[defId] = next;
          }
        }

        for (const [defId, qty] of Object.entries(patch.grant.stacks)) {
          inv.stacks[defId] = (inv.stacks[defId] ?? 0) + qty;
        }

        await atomicWrite(inventoryPath, inv);
      });
    }

    store.records[patch.escrowId] = {
      escrowId: patch.escrowId,
      resolvedAt: Date.now(),
      runId: patch.runId,
      result: patch.result,
      patchHash,
    };
    await atomicWrite(resolvesPath, store);

    await auditLog(path.join(dataDir, 'audit.jsonl'), {
      action: 'run.resolve',
      playerId: patch.playerId ?? 'unknown',
      data: { escrowId: patch.escrowId, runId: patch.runId, result: patch.result },
    });

    return { status: 'ok' };
  });
}

export async function getEscrowRecord(
  dataDir: string,
  escrowId: string,
): Promise<EscrowResolveRecord | null> {
  const resolvesPath = path.join(dataDir, 'escrow_resolves.json');
  try {
    const store = await readJsonFile<EscrowResolveStore>(resolvesPath);
    return store.records[escrowId] ?? null;
  } catch {
    return null;
  }
}

export async function deleteEscrowRecord(
  dataDir: string,
  escrowId: string,
): Promise<void> {
  const resolvesPath = path.join(dataDir, 'escrow_resolves.json');
  await withFileLock(resolvesPath, async () => {
    const store = await readJsonFile<EscrowResolveStore>(resolvesPath);
    delete store.records[escrowId];
    await atomicWrite(resolvesPath, store);
  });
}
