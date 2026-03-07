import { v4 as uuidv4 } from 'uuid';
import path from 'node:path';
import { getMutex } from '../storage/mutex-registry.js';
import { readJsonFile } from '../storage/file-store.js';
import { atomicWrite } from '../storage/atomic-write.js';
import { getOrCreateInventory } from '../storage/inventory-store.js';
import { withTradesLock, inventoryPath } from '../storage/trades-store.js';
import { getContent } from '../content/loader.js';
import type { PlayerInventory } from '@org/shared';
import type { TradeOffer, EscrowSlot, TradeItem } from '@org/shared';
import type { TradesStore } from '../types/trade.js';
import type { ProposeTradeBody, CounterTradeBody } from './schemas.js';

const TRADE_TTL_MS = 24 * 60 * 60 * 1000;

function isExpired(trade: TradeOffer): boolean {
  return Date.now() > new Date(trade.expiresAt).getTime();
}

function buildEscrowSlot(inv: PlayerInventory, items: TradeItem[]): EscrowSlot {
  const instanceData: EscrowSlot['instanceData'] = {};
  for (const item of items) {
    if (item.kind === 'instance') {
      const inst = inv.instances[item.itemId];
      if (!inst) {
        throw Object.assign(
          new Error(`Instance ${item.itemId} not found in inventory`),
          { statusCode: 400 }
        );
      }
      instanceData[item.itemId] = inst;
    }
  }
  return { items, instanceData };
}

function deductItemsFromInventory(inv: PlayerInventory, items: TradeItem[]): void {
  const { itemDefs } = getContent();
  for (const item of items) {
    if (item.kind === 'stack') {
      const def = itemDefs[item.defId];
      if (!def) {
        throw Object.assign(new Error(`Unknown defId: ${item.defId}`), { statusCode: 400 });
      }
      if (!def.tradeable) {
        throw Object.assign(new Error(`Item ${item.defId} is not tradeable`), { statusCode: 400 });
      }
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
      const inst = inv.instances[item.itemId];
      if (!inst) {
        throw Object.assign(
          new Error(`Instance ${item.itemId} not found in inventory`),
          { statusCode: 400 }
        );
      }
      const def = itemDefs[inst.defId];
      if (!def?.tradeable) {
        throw Object.assign(new Error(`Item ${inst.defId} is not tradeable`), { statusCode: 400 });
      }
      delete inv.instances[item.itemId];
    }
  }
}

function addEscrowToInventory(inv: PlayerInventory, escrow: EscrowSlot): void {
  for (const item of escrow.items) {
    if (item.kind === 'stack') {
      inv.stacks[item.defId] = (inv.stacks[item.defId] ?? 0) + item.qty;
    } else {
      inv.instances[item.itemId] = escrow.instanceData[item.itemId]!;
    }
  }
}

export async function proposeTrade(
  dataDir: string,
  proposerId: string,
  body: ProposeTradeBody
): Promise<TradeOffer> {
  return withTradesLock(dataDir, async (store, saveStore) => {
    const propInvPath = inventoryPath(dataDir, proposerId);
    return getMutex(propInvPath).runExclusive(async () => {
      const inv = await getOrCreateInventory(dataDir, proposerId);
      deductItemsFromInventory(inv, body.offerItems);
      const escrow = buildEscrowSlot(inv, body.offerItems);
      await atomicWrite(propInvPath, inv);

      const now = new Date().toISOString();
      const trade: TradeOffer = {
        tradeId: uuidv4(),
        proposerId,
        targetId: body.targetPlayerId,
        proposerEscrow: escrow,
        targetEscrow: null,
        proposerApproved: false,
        targetApproved: false,
        status: 'awaiting_counter',
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(Date.now() + TRADE_TTL_MS).toISOString(),
      };

      store.trades[trade.tradeId] = trade;
      await saveStore(store);
      return trade;
    });
  });
}

export async function counterTrade(
  dataDir: string,
  targetId: string,
  tradeId: string,
  body: CounterTradeBody
): Promise<TradeOffer> {
  return withTradesLock(dataDir, async (store, saveStore) => {
    const trade = store.trades[tradeId];
    if (!trade) {
      throw Object.assign(new Error('Trade not found'), { statusCode: 404 });
    }
    if (trade.targetId !== targetId) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    }
    if (trade.status !== 'awaiting_counter') {
      throw Object.assign(
        new Error(`Trade is not awaiting counter (status: ${trade.status})`),
        { statusCode: 400 }
      );
    }

    if (isExpired(trade)) {
      // Return proposer escrow
      const propInvPath = inventoryPath(dataDir, trade.proposerId);
      await getMutex(propInvPath).runExclusive(async () => {
        const inv = await getOrCreateInventory(dataDir, trade.proposerId);
        addEscrowToInventory(inv, trade.proposerEscrow);
        await atomicWrite(propInvPath, inv);
      });
      trade.status = 'expired';
      trade.updatedAt = new Date().toISOString();
      await saveStore(store);
      throw Object.assign(new Error('Trade has expired'), { statusCode: 410 });
    }

    const targetInvPath = inventoryPath(dataDir, targetId);
    return getMutex(targetInvPath).runExclusive(async () => {
      const inv = await getOrCreateInventory(dataDir, targetId);
      deductItemsFromInventory(inv, body.counterItems);
      const escrow = buildEscrowSlot(inv, body.counterItems);
      await atomicWrite(targetInvPath, inv);

      trade.targetEscrow = escrow;
      trade.status = 'awaiting_approval';
      trade.updatedAt = new Date().toISOString();
      await saveStore(store);
      return trade;
    });
  });
}

export async function approveTrade(
  dataDir: string,
  playerId: string,
  tradeId: string
): Promise<TradeOffer> {
  return withTradesLock(dataDir, async (store, saveStore) => {
    const trade = store.trades[tradeId];
    if (!trade) {
      throw Object.assign(new Error('Trade not found'), { statusCode: 404 });
    }
    if (trade.proposerId !== playerId && trade.targetId !== playerId) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    }
    if (trade.status !== 'awaiting_approval') {
      throw Object.assign(
        new Error(`Trade is not awaiting approval (status: ${trade.status})`),
        { statusCode: 400 }
      );
    }

    if (isExpired(trade)) {
      const propInvPath = inventoryPath(dataDir, trade.proposerId);
      const targInvPath = inventoryPath(dataDir, trade.targetId);
      const sorted = [propInvPath, targInvPath].sort();
      await getMutex(sorted[0]!).runExclusive(async () => {
        await getMutex(sorted[1]!).runExclusive(async () => {
          const propInv = await getOrCreateInventory(dataDir, trade.proposerId);
          addEscrowToInventory(propInv, trade.proposerEscrow);
          await atomicWrite(propInvPath, propInv);

          const targInv = await getOrCreateInventory(dataDir, trade.targetId);
          addEscrowToInventory(targInv, trade.targetEscrow!);
          await atomicWrite(targInvPath, targInv);
        });
      });
      trade.status = 'expired';
      trade.updatedAt = new Date().toISOString();
      await saveStore(store);
      throw Object.assign(new Error('Trade has expired'), { statusCode: 410 });
    }

    if (playerId === trade.proposerId) {
      trade.proposerApproved = true;
    } else {
      trade.targetApproved = true;
    }

    if (trade.proposerApproved && trade.targetApproved) {
      const propInvPath = inventoryPath(dataDir, trade.proposerId);
      const targInvPath = inventoryPath(dataDir, trade.targetId);
      const sorted = [propInvPath, targInvPath].sort();
      await getMutex(sorted[0]!).runExclusive(async () => {
        await getMutex(sorted[1]!).runExclusive(async () => {
          const propInv = await getOrCreateInventory(dataDir, trade.proposerId);
          addEscrowToInventory(propInv, trade.targetEscrow!);
          await atomicWrite(propInvPath, propInv);

          const targInv = await getOrCreateInventory(dataDir, trade.targetId);
          addEscrowToInventory(targInv, trade.proposerEscrow);
          await atomicWrite(targInvPath, targInv);
        });
      });
      trade.status = 'completed';
    }

    trade.updatedAt = new Date().toISOString();
    await saveStore(store);
    return trade;
  });
}

export async function cancelTrade(
  dataDir: string,
  playerId: string,
  tradeId: string
): Promise<TradeOffer> {
  return withTradesLock(dataDir, async (store, saveStore) => {
    const trade = store.trades[tradeId];
    if (!trade) {
      throw Object.assign(new Error('Trade not found'), { statusCode: 404 });
    }
    if (trade.proposerId !== playerId && trade.targetId !== playerId) {
      throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    }
    if (trade.status !== 'awaiting_counter' && trade.status !== 'awaiting_approval') {
      throw Object.assign(
        new Error(`Trade cannot be cancelled (status: ${trade.status})`),
        { statusCode: 400 }
      );
    }

    // Return proposer escrow
    const propInvPath = inventoryPath(dataDir, trade.proposerId);
    await getMutex(propInvPath).runExclusive(async () => {
      const inv = await getOrCreateInventory(dataDir, trade.proposerId);
      addEscrowToInventory(inv, trade.proposerEscrow);
      await atomicWrite(propInvPath, inv);
    });

    // Return target escrow if present
    if (trade.status === 'awaiting_approval' && trade.targetEscrow) {
      const targInvPath = inventoryPath(dataDir, trade.targetId);
      await getMutex(targInvPath).runExclusive(async () => {
        const inv = await getOrCreateInventory(dataDir, trade.targetId);
        addEscrowToInventory(inv, trade.targetEscrow!);
        await atomicWrite(targInvPath, inv);
      });
    }

    trade.status = 'cancelled';
    trade.updatedAt = new Date().toISOString();
    await saveStore(store);
    return trade;
  });
}

export async function listTrades(
  dataDir: string,
  playerId: string
): Promise<{ incoming: TradeOffer[]; outgoing: TradeOffer[]; history: TradeOffer[] }> {
  const tradesFilePath = path.join(dataDir, 'trades.json');
  const store = await readJsonFile<TradesStore>(tradesFilePath);
  const now = Date.now();

  const incoming: TradeOffer[] = [];
  const outgoing: TradeOffer[] = [];
  const history: TradeOffer[] = [];

  for (const trade of Object.values(store.trades)) {
    const isProposer = trade.proposerId === playerId;
    const isTarget = trade.targetId === playerId;
    if (!isProposer && !isTarget) continue;

    const activeStatuses = ['awaiting_counter', 'awaiting_approval'] as const;
    const isPending = (activeStatuses as readonly string[]).includes(trade.status);
    const effectivelyExpired = isPending && now > new Date(trade.expiresAt).getTime();

    if (effectivelyExpired || trade.status === 'completed' || trade.status === 'cancelled' || trade.status === 'expired') {
      const displayTrade = effectivelyExpired ? { ...trade, status: 'expired' as const } : trade;
      history.push(displayTrade);
    } else if (isPending) {
      if (isTarget) {
        incoming.push(trade);
      } else {
        outgoing.push(trade);
      }
    }
  }

  return { incoming, outgoing, history };
}

export async function getTrade(
  dataDir: string,
  tradeId: string,
  playerId: string
): Promise<TradeOffer> {
  const tradesFilePath = path.join(dataDir, 'trades.json');
  const store = await readJsonFile<TradesStore>(tradesFilePath);
  const trade = store.trades[tradeId];
  if (!trade) {
    throw Object.assign(new Error('Trade not found'), { statusCode: 404 });
  }
  if (trade.proposerId !== playerId && trade.targetId !== playerId) {
    throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
  }
  return trade;
}
