import {
  readStaticJson,
  readDynamicJson,
  writeDynamicJson,
} from '../data/persistence.js';
import type { Wrestler, Manager, WeeklyState, WeeklySubmission, Announcer, NarrativeEvent, SocialThread } from '@org/wrastlin-shared';
import type { ShowOutline } from '../agents/types.js';

export function loadWrestlers(): Wrestler[] {
  try {
    return readDynamicJson<Wrestler[]>('wrestlers.json');
  } catch {
    return readStaticJson<Wrestler[]>('wrestlers.json');
  }
}

export function saveWrestlers(wrestlers: Wrestler[]): void {
  writeDynamicJson('wrestlers.json', wrestlers);
}

export function loadManagers(): Manager[] {
  try {
    return readDynamicJson<Manager[]>('managers.json');
  } catch {
    return readStaticJson<Manager[]>('managers.json');
  }
}

export function saveManagers(managers: Manager[]): void {
  writeDynamicJson('managers.json', managers);
}

export function loadState(): WeeklyState {
  return readDynamicJson<WeeklyState>('state.json');
}

export function saveState(state: WeeklyState): void {
  writeDynamicJson('state.json', state);
}

export function loadSubmissions(week: number): WeeklySubmission[] {
  try {
    return readDynamicJson<WeeklySubmission[]>(`submissions/week-${week}.json`);
  } catch {
    return [];
  }
}

export function saveSubmissions(week: number, submissions: WeeklySubmission[]): void {
  writeDynamicJson(`submissions/week-${week}.json`, submissions);
}

export function loadAnnouncers(): Announcer[] {
  return readStaticJson<Announcer[]>('announcers.json');
}

export function loadEvents(): NarrativeEvent[] {
  try {
    return readDynamicJson<NarrativeEvent[]>('events.json');
  } catch {
    return [];
  }
}

export function saveEvents(events: NarrativeEvent[]): void {
  writeDynamicJson('events.json', events);
}

export function loadThreads(): SocialThread[] {
  try {
    return readDynamicJson<SocialThread[]>('threads.json');
  } catch {
    return [];
  }
}

export function saveThreads(threads: SocialThread[]): void {
  writeDynamicJson('threads.json', threads);
}

interface ShowFile {
  showOutline: ShowOutline;
}

export function loadPreviousOutlines(currentWeek: number, limit: number): ShowOutline[] {
  const results: ShowOutline[] = [];
  for (let w = currentWeek - 1; w >= 1 && results.length < limit; w--) {
    try {
      const show = readDynamicJson<ShowFile>(`shows/week-${w}.json`);
      results.push(show.showOutline);
    } catch {
      // no show file for this week — skip
    }
  }
  return results;
}
