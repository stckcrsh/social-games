import { describe, it, expect } from 'vitest';
import type { SocialThread } from '@org/wrastlin-shared';
import { scoreThread, isThreadRelevant } from './scoreThread.js';

function makeThread(overrides: Partial<SocialThread> = {}): SocialThread {
  return {
    threadId: 't-001',
    title: 'Rex vs Steel Conflict',
    subjects: ['w-001', 'w-002'],
    tags: ['conflict', 'rivalry'],
    createdWeek: 1,
    lastUpdatedWeek: 3,
    eventIds: [],
    actorStates: [
      { wrestlerId: 'w-001', care: 8, stance: 'aggrieved', summary: 'Rex wants revenge' },
      { wrestlerId: 'w-002', care: 3, stance: 'dismissive', summary: 'Steel barely cares' },
    ],
    ...overrides,
  };
}

// ── isThreadRelevant ──────────────────────────────────────────────────────────

describe('isThreadRelevant', () => {
  it('returns true when a query wrestler is in subjects', () => {
    const thread = makeThread({ subjects: ['w-001'] });
    expect(isThreadRelevant(thread, ['w-001'])).toBe(true);
  });

  it('returns true when a query wrestler is in actorStates but not subjects', () => {
    const thread = makeThread({
      subjects: ['w-002'],
      actorStates: [{ wrestlerId: 'w-001', care: 4, stance: 'curious', summary: '' }],
    });
    expect(isThreadRelevant(thread, ['w-001'])).toBe(true);
  });

  it('returns false when no query wrestler appears in subjects or actorStates', () => {
    const thread = makeThread({ subjects: ['w-003'], actorStates: [] });
    expect(isThreadRelevant(thread, ['w-001'])).toBe(false);
  });

  it('returns true when any of multiple query wrestlers matches', () => {
    const thread = makeThread({ subjects: ['w-004'] });
    expect(isThreadRelevant(thread, ['w-001', 'w-004'])).toBe(true);
  });
});

// ── scoreThread ───────────────────────────────────────────────────────────────

describe('scoreThread', () => {
  it('gives subjectMatchBonus of 5 when a query wrestler is a subject', () => {
    const thread = makeThread({ subjects: ['w-001'], actorStates: [] });
    const score = scoreThread(thread, ['w-001'], 3);
    // subjectMatch=5, care=0, recency=max(0,10-(3-3))=10
    expect(score).toBe(15);
  });

  it('gives no subjectMatchBonus when query wrestler is only in actorStates', () => {
    const thread = makeThread({
      subjects: ['w-002'],
      actorStates: [{ wrestlerId: 'w-001', care: 5, stance: '', summary: '' }],
    });
    const score = scoreThread(thread, ['w-001'], 3);
    // subjectMatch=0, care=5, recency=10
    expect(score).toBe(15);
  });

  it('careScore is the max care among query wrestlers in actorStates', () => {
    const thread = makeThread({
      subjects: ['w-001', 'w-002'],
      actorStates: [
        { wrestlerId: 'w-001', care: 6, stance: '', summary: '' },
        { wrestlerId: 'w-002', care: 9, stance: '', summary: '' },
      ],
    });
    // query is ['w-001', 'w-002'], max care = 9
    // subjectMatch=5, care=9, recency=10
    const score = scoreThread(thread, ['w-001', 'w-002'], 3);
    expect(score).toBe(24);
  });

  it('careScore is 0 when query wrestler has no actorState entry', () => {
    const thread = makeThread({ subjects: ['w-001'], actorStates: [] });
    const score = scoreThread(thread, ['w-001'], 3);
    // subjectMatch=5, care=0, recency=10
    expect(score).toBe(15);
  });

  it('recencyScore is 10 when thread was updated this week', () => {
    const thread = makeThread({ lastUpdatedWeek: 5 });
    const score = scoreThread(thread, ['w-001'], 5);
    // subjectMatch=5, care=8, recency=10
    expect(score).toBe(23);
  });

  it('recencyScore decays by 1 per week', () => {
    const thread = makeThread({ subjects: ['w-001'], actorStates: [], lastUpdatedWeek: 1 });
    const score3 = scoreThread(thread, ['w-001'], 3);  // recency = 10-(3-1) = 8
    expect(score3).toBe(13); // 5+0+8
    const score5 = scoreThread(thread, ['w-001'], 5);  // recency = 10-(5-1) = 6
    expect(score5).toBe(11); // 5+0+6
  });

  it('recencyScore floors at 0 for threads older than 10 weeks', () => {
    const thread = makeThread({ subjects: ['w-001'], actorStates: [], lastUpdatedWeek: 1 });
    const score = scoreThread(thread, ['w-001'], 12); // 10-(12-1) = -1 → 0
    expect(score).toBe(5); // 5+0+0
  });

  it('tagScore adds 1 per matching preferred tag, capped at 5', () => {
    const thread = makeThread({
      subjects: ['w-001'],
      tags: ['conflict', 'title', 'betrayal'],
      actorStates: [],
      lastUpdatedWeek: 3,
    });
    // subjectMatch=5, care=0, recency=10, tagScore=min(2,5)=2
    const score = scoreThread(thread, ['w-001'], 3, ['conflict', 'title', 'grudge']);
    expect(score).toBe(17);
  });

  it('tagScore is capped at 5 even with many matching tags', () => {
    const thread = makeThread({
      subjects: ['w-001'],
      tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
      actorStates: [],
      lastUpdatedWeek: 3,
    });
    const score = scoreThread(thread, ['w-001'], 3, ['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    // subjectMatch=5, care=0, recency=10, tagScore=min(7,5)=5
    expect(score).toBe(20);
  });

  it('tagScore is 0 when no preferredTags provided', () => {
    const thread = makeThread({ subjects: ['w-001'], actorStates: [], lastUpdatedWeek: 3 });
    const withTags = scoreThread(thread, ['w-001'], 3, ['conflict']);
    const noTags = scoreThread(thread, ['w-001'], 3);
    expect(noTags).toBe(15);   // subjectMatch=5, care=0, recency=10, tagScore=0
    expect(withTags).toBe(16); // adds tagScore=1 for matching 'conflict'
  });

  it('full score: subject + care + recency + tags', () => {
    const thread = makeThread({
      subjects: ['w-001'],
      tags: ['conflict'],
      actorStates: [{ wrestlerId: 'w-001', care: 7, stance: '', summary: '' }],
      lastUpdatedWeek: 4,
    });
    // subjectMatch=5, care=7, recency=max(0,10-(5-4))=9, tagScore=min(1,5)=1
    const score = scoreThread(thread, ['w-001'], 5, ['conflict']);
    expect(score).toBe(22);
  });
});
