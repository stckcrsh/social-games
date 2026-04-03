import { describe, it, expect } from 'vitest';
import type { SocialThread, NarrativeEvent } from '@org/wrastlin-shared';
import { retrieveRelevantThreads } from './retrieveThreads.js';

function makeThread(id: string, overrides: Partial<SocialThread> = {}): SocialThread {
  return {
    threadId: id,
    title: `Thread ${id}`,
    subjects: ['w-001'],
    tags: ['conflict'],
    createdWeek: 1,
    lastUpdatedWeek: 3,
    eventIds: [],
    actorStates: [{ wrestlerId: 'w-001', care: 5, stance: 'neutral', summary: '' }],
    ...overrides,
  };
}

function makeEvent(id: string, week: number): NarrativeEvent {
  return {
    eventId: id,
    week,
    participants: ['w-001'],
    description: `Event ${id}`,
    tags: ['match-result'],
  };
}

const WEEK_3_THREAD = makeThread('t-001', { lastUpdatedWeek: 3, actorStates: [{ wrestlerId: 'w-001', care: 8, stance: '', summary: '' }] });
const WEEK_1_THREAD = makeThread('t-002', { lastUpdatedWeek: 1, actorStates: [{ wrestlerId: 'w-001', care: 8, stance: '', summary: '' }] });
const UNRELATED_THREAD = makeThread('t-003', { subjects: ['w-003'], actorStates: [] });

describe('retrieveRelevantThreads', () => {
  it('excludes threads with no connection to query wrestlers', () => {
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [WEEK_3_THREAD, UNRELATED_THREAD],
      [],
    );
    expect(result.map(r => r.thread.threadId)).not.toContain('t-003');
  });

  it('returns threads sorted by score descending', () => {
    // t-001 is more recent (week 3) than t-002 (week 1), same care
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [WEEK_1_THREAD, WEEK_3_THREAD],
      [],
    );
    expect(result[0].thread.threadId).toBe('t-001');
    expect(result[1].thread.threadId).toBe('t-002');
  });

  it('limits results to query.limit (default 5)', () => {
    const threads = Array.from({ length: 8 }, (_, i) => makeThread(`t-${i + 1}`));
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      threads,
      [],
    );
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('respects custom limit', () => {
    const threads = Array.from({ length: 8 }, (_, i) => makeThread(`t-${i + 1}`));
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3, limit: 3 },
      threads,
      [],
    );
    expect(result).toHaveLength(3);
  });

  it('returns fewer results than limit when fewer threads are relevant', () => {
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3, limit: 10 },
      [WEEK_3_THREAD],
      [],
    );
    expect(result).toHaveLength(1);
  });

  it('each result includes the score', () => {
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [WEEK_3_THREAD],
      [],
    );
    expect(typeof result[0].score).toBe('number');
    expect(result[0].score).toBeGreaterThan(0);
  });

  it('relevantActorStates contains only the query wrestlers actorStates', () => {
    const thread = makeThread('t-mixed', {
      actorStates: [
        { wrestlerId: 'w-001', care: 7, stance: '', summary: '' },
        { wrestlerId: 'w-999', care: 9, stance: '', summary: '' },
      ],
    });
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [thread],
      [],
    );
    expect(result[0].relevantActorStates).toHaveLength(1);
    expect(result[0].relevantActorStates[0].wrestlerId).toBe('w-001');
  });

  it('linkedEvents are events whose eventId is in thread.eventIds', () => {
    const thread = makeThread('t-001', { eventIds: ['e-001', 'e-002'] });
    const events: NarrativeEvent[] = [
      makeEvent('e-001', 3),
      makeEvent('e-002', 2),
      makeEvent('e-999', 1),  // not linked to this thread
    ];
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [thread],
      events,
    );
    const linkedIds = result[0].linkedEvents.map(e => e.eventId);
    expect(linkedIds).toContain('e-001');
    expect(linkedIds).toContain('e-002');
    expect(linkedIds).not.toContain('e-999');
  });

  it('linkedEvents are sorted most recent first', () => {
    const thread = makeThread('t-001', { eventIds: ['e-001', 'e-002', 'e-003'] });
    const events: NarrativeEvent[] = [
      makeEvent('e-001', 1),
      makeEvent('e-002', 3),
      makeEvent('e-003', 2),
    ];
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [thread],
      events,
    );
    const weeks = result[0].linkedEvents.map(e => e.week);
    expect(weeks).toEqual([3, 2, 1]);
  });

  it('preferred tags boost threads with matching tags above those without', () => {
    const withTag = makeThread('t-conflict', {
      tags: ['conflict', 'rivalry'],
      actorStates: [{ wrestlerId: 'w-001', care: 5, stance: '', summary: '' }],
      lastUpdatedWeek: 1,  // older — would score lower without tag bonus
    });
    const withoutTag = makeThread('t-title', {
      tags: ['title'],
      actorStates: [{ wrestlerId: 'w-001', care: 5, stance: '', summary: '' }],
      lastUpdatedWeek: 3,  // newer — scores higher without tag boost
    });
    // Without preferred tags, t-title wins (more recent)
    const withoutPref = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [withTag, withoutTag],
      [],
    );
    expect(withoutPref[0].thread.threadId).toBe('t-title');

    // With preferred tag 'conflict', t-conflict gets +2 bonus — enough to overtake
    const withPref = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3, preferredTags: ['conflict', 'rivalry'] },
      [withTag, withoutTag],
      [],
    );
    expect(withPref[0].thread.threadId).toBe('t-conflict');
  });

  it('returns empty array when no threads are relevant', () => {
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-999'], currentWeek: 3 },
      [WEEK_3_THREAD, UNRELATED_THREAD],
      [],
    );
    expect(result).toHaveLength(0);
  });

  it('handles empty threads array', () => {
    const result = retrieveRelevantThreads(
      { wrestlerIds: ['w-001'], currentWeek: 3 },
      [],
      [],
    );
    expect(result).toHaveLength(0);
  });
});
