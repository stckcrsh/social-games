import { readJson, writeJson } from '../data/persistence.js';
import type { Wrestler, Manager, WeeklyState, WeeklySubmission } from '@org/wrastlin-shared';

export function loadWrestlers(): Wrestler[] {
  return readJson<Wrestler[]>('wrestlers.json');
}

export function saveWrestlers(wrestlers: Wrestler[]): void {
  writeJson('wrestlers.json', wrestlers);
}

export function loadManagers(): Manager[] {
  return readJson<Manager[]>('managers.json');
}

export function saveManagers(managers: Manager[]): void {
  writeJson('managers.json', managers);
}

export function loadState(): WeeklyState {
  return readJson<WeeklyState>('state.json');
}

export function saveState(state: WeeklyState): void {
  writeJson('state.json', state);
}

export function loadSubmissions(week: number): WeeklySubmission[] {
  try {
    return readJson<WeeklySubmission[]>(`submissions/week-${week}.json`);
  } catch {
    return [];
  }
}

export function saveSubmissions(week: number, submissions: WeeklySubmission[]): void {
  writeJson(`submissions/week-${week}.json`, submissions);
}
