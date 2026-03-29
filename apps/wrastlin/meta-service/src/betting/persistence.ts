import path from 'node:path';
import { readJsonOrDefault, writeDynamicJson } from '../data/persistence.js';
import type { BettingState, BetProposition, BetEntry } from '@org/wrastlin-shared';

const DIR = 'betting';
const DYNAMIC_DIR = process.env['DYNAMIC_DATA_DIR'] ?? path.resolve(__dirname, '../data/runtime');

export function loadBettingState(): BettingState | null {
  return readJsonOrDefault<BettingState | null>(`${DIR}/state.json`, null);
}

export function saveBettingState(state: BettingState): void {
  writeDynamicJson(`${DIR}/state.json`, state);
}

export function loadPropositions(week: number): BetProposition[] {
  return readJsonOrDefault<BetProposition[]>(`${DIR}/propositions-${week}.json`, []);
}

export function savePropositions(week: number, propositions: BetProposition[]): void {
  writeDynamicJson(`${DIR}/propositions-${week}.json`, propositions);
}

export function loadEntries(week: number): BetEntry[] {
  return readJsonOrDefault<BetEntry[]>(`${DIR}/entries-${week}.json`, []);
}

export function saveEntries(week: number, entries: BetEntry[]): void {
  writeDynamicJson(`${DIR}/entries-${week}.json`, entries);
}

export function bettingLogPath(week: number): string {
  return path.resolve(DYNAMIC_DIR, DIR, `week-${week}.jsonl`);
}
