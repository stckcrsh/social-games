import { randomUUID } from 'crypto';
import { loadPropositions, loadEntries, saveEntries } from './persistence.js';
import { readJsonOrDefault, writeDynamicJson } from '../data/persistence.js';
import type { BetEntry, Manager } from '@org/wrastlin-shared';

export { loadEntries };

export function placeEntry(
  week: number,
  propositionId: string,
  bettorId: string,
  optionId: string,
  amount: number,
): BetEntry {
  const propositions = loadPropositions(week);
  const proposition = propositions.find(p => p.propositionId === propositionId);
  if (!proposition) throw new Error(`Proposition not found: ${propositionId}`);

  const option = proposition.options.find(o => o.optionId === optionId);
  if (!option) throw new Error(`Option not found: ${optionId}`);

  const managers = readJsonOrDefault<Manager[]>('managers.json', []);
  const manager = managers.find(m => m.managerId === bettorId);
  if (!manager) throw new Error(`Manager not found: ${bettorId}`);
  if (manager.money < amount) {
    throw new Error(`Insufficient funds: has ${manager.money}, needs ${amount}`);
  }

  // Deduct balance first — if anything below fails, the deduction is the safer state
  manager.money -= amount;
  writeDynamicJson('managers.json', managers);

  const entry: BetEntry = {
    entryId: randomUUID(),
    propositionId,
    bettorId,
    optionId,
    amount,
    placedAt: new Date().toISOString(),
  };

  saveEntries(week, [...loadEntries(week), entry]);
  return entry;
}
