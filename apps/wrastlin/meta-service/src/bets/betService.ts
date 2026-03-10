import { readJson, writeJson } from '../data/persistence.js';
import { loadManagers, saveManagers } from '../core/gameState.js';
import type { BetProposition, BetEntry } from '@org/betting';

export function loadPropositions(): BetProposition[] {
  try {
    return readJson<BetProposition[]>('bets/propositions.json');
  } catch {
    return [];
  }
}

export function savePropositions(propositions: BetProposition[]): void {
  writeJson('bets/propositions.json', propositions);
}

export function loadEntries(): BetEntry[] {
  try {
    return readJson<BetEntry[]>('bets/entries.json');
  } catch {
    return [];
  }
}

export function saveEntries(entries: BetEntry[]): void {
  writeJson('bets/entries.json', entries);
}

/**
 * Deducts `amount` from a manager's money balance.
 * Throws if manager not found or has insufficient funds.
 *
 * Concurrency note: this is a read-then-write with no locking.
 * Acceptable for MVP single-server, low-concurrency usage.
 */
export function deductMoney(managerId: string, amount: number): void {
  const managers = loadManagers();
  const manager = managers.find(m => m.managerId === managerId);
  if (!manager) throw new Error(`Manager not found: ${managerId}`);
  if (manager.money < amount) throw new Error('Insufficient funds');
  manager.money -= amount;
  saveManagers(managers);
}

/**
 * Credits `amount` to a manager's money balance.
 * `amount` is the full parimutuel share (includes original stake).
 * Do NOT additionally refund the original stake.
 */
export function creditMoney(managerId: string, amount: number): void {
  const managers = loadManagers();
  const manager = managers.find(m => m.managerId === managerId);
  if (!manager) throw new Error(`Manager not found: ${managerId}`);
  manager.money += amount;
  saveManagers(managers);
}
