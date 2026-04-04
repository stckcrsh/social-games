import { describe, it, expect } from 'vitest';
import type { Wrestler, Manager, WeeklySubmission, Announcer, SocialThread } from '@org/wrastlin-shared';
import type { MatchOutlineSegment, PromoOutlineSegment, MatchBeats } from './types.js';
import type { RetrievedThread } from '../retrieval/types.js';
import {
  buildShowOutlineInput,
  buildMatchBeatsInput,
  buildPromoScreenplayInput,
  buildAnnouncerScreenplayInput,
  buildWrestlerThoughtProcessInput,
} from './dataBuilders.js';

function makeWrestler(id: string): Wrestler {
  return {
    wrestlerId: id,
    name: `Wrestler ${id}`,
    gimmick: 'Test Gimmick',
    stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
    personality: { ego: 5, anger: 5, honor: 5, loyalty: 5, ambition: 5 },
    emotionalState: { confidence: 5, frustration: 5, fatigue: 5 },
    managerTrust: 5,
    finisher: 'Test Finisher',
  };
}

function makeManager(managerId: string, wrestlerId: string): Manager {
  return { managerId, wrestlerId, money: 1000, trustLevel: 'medium' };
}

function makeSubmission(managerId: string, week: number, overrides: Partial<WeeklySubmission> = {}): WeeklySubmission {
  return {
    submissionId: `sub-${managerId}`,
    managerId,
    week,
    showRequest: 'Book my wrestler in a big match',
    bribeAmount: 100,
    submittedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const SAMPLE_MATCH_SEGMENT: MatchOutlineSegment = {
  segmentId: 's-001',
  order: 2,
  type: 'match',
  matchType: 'singles',
  participants: ['w-001', 'w-002'],
  interference: [],
  headliner: false,
};

const SAMPLE_PROMO_SEGMENT: PromoOutlineSegment = {
  segmentId: 's-002',
  order: 1,
  type: 'promo',
  participants: ['w-001'],
  target: 'w-002',
  goal: 'Rex trash-talks Steel Purity',
};

const SAMPLE_ANNOUNCERS: Announcer[] = [
  {
    announcerId: 'a-001',
    name: 'Brock Calloway',
    role: 'play-by-play',
    theme: 'Energetic Southern broadcaster',
    catchphrases: ['Good God Almighty!'],
  },
];

describe('buildShowOutlineInput', () => {
  it('maps each wrestler into a summary', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const result = buildShowOutlineInput(1, wrestlers, [], [], [], []);
    expect(result.wrestlers).toHaveLength(2);
    expect(result.wrestlers[0].wrestlerId).toBe('w-001');
  });

  it('joins wrestler ID onto submission via manager and maps showRequest and bribeAmount', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const managers = [makeManager('m-001', 'w-001')];
    const submissions = [makeSubmission('m-001', 1, { showRequest: 'Main event please', bribeAmount: 500 })];
    const result = buildShowOutlineInput(1, wrestlers, managers, submissions, [], []);
    expect(result.submissions[0].wrestlerId).toBe('w-001');
    expect(result.submissions[0].managerId).toBe('m-001');
    expect(result.submissions[0].showRequest).toBe('Main event please');
    expect(result.submissions[0].bribeAmount).toBe(500);
  });

  it('omits submissions whose manager does not match any manager', () => {
    const wrestlers = [makeWrestler('w-001')];
    const managers = [makeManager('m-001', 'w-001')];
    const submissions = [makeSubmission('m-999', 1)];  // unknown manager
    const result = buildShowOutlineInput(1, wrestlers, managers, submissions, [], []);
    expect(result.submissions).toHaveLength(0);
  });

  it('passes relevantThreads through to the output', () => {
    const thread: RetrievedThread = {
      thread: {
        threadId: 't-001',
        title: 'Rex vs Steel Feud',
        subjects: ['w-001', 'w-002'],
        tags: ['feud'],
        createdWeek: 1,
        lastUpdatedWeek: 2,
        eventIds: [],
        actorStates: [],
      },
      score: 15,
      relevantActorStates: [],
      linkedEvents: [],
    };
    const result = buildShowOutlineInput(1, [makeWrestler('w-001')], [], [], [], [thread]);
    expect(result.relevantThreads).toHaveLength(1);
    expect(result.relevantThreads[0].thread.threadId).toBe('t-001');
  });
});

describe('buildMatchBeatsInput', () => {
  it('only includes wrestlers who are participants or interference', () => {
    const wrestlers = [
      makeWrestler('w-001'),
      makeWrestler('w-002'),
      makeWrestler('w-003'),  // not in this match
    ];
    const segment: MatchOutlineSegment = { ...SAMPLE_MATCH_SEGMENT, participants: ['w-001', 'w-002'], interference: [] };
    const result = buildMatchBeatsInput(segment, wrestlers);
    expect(result.wrestlers.map(w => w.wrestlerId)).toEqual(['w-001', 'w-002']);
  });

  it('includes interference wrestler in the payload', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002'), makeWrestler('w-003')];
    const segment: MatchOutlineSegment = { ...SAMPLE_MATCH_SEGMENT, interference: ['w-003'] };
    const result = buildMatchBeatsInput(segment, wrestlers);
    expect(result.wrestlers.map(w => w.wrestlerId)).toContain('w-003');
  });

});

describe('buildPromoScreenplayInput', () => {
  it('maps participants from the segment', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const result = buildPromoScreenplayInput(SAMPLE_PROMO_SEGMENT, wrestlers, SAMPLE_ANNOUNCERS, []);
    expect(result.participants.map(p => p.wrestlerId)).toEqual(['w-001']);
  });

  it('returns target when segment has a target', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const result = buildPromoScreenplayInput(SAMPLE_PROMO_SEGMENT, wrestlers, SAMPLE_ANNOUNCERS, []);
    expect(result.target).not.toBeNull();
    expect(result.target!.wrestlerId).toBe('w-002');
  });

  it('returns null target for self-hype promos', () => {
    const promoNoTarget: PromoOutlineSegment = { ...SAMPLE_PROMO_SEGMENT, target: undefined };
    const wrestlers = [makeWrestler('w-001')];
    const result = buildPromoScreenplayInput(promoNoTarget, wrestlers, SAMPLE_ANNOUNCERS, []);
    expect(result.target).toBeNull();
  });

  it('passes relevantThreads through to the output', () => {
    const thread: RetrievedThread = {
      thread: {
        threadId: 't-promo',
        title: 'Promo Rivalry',
        subjects: ['w-001'],
        tags: ['rivalry'],
        createdWeek: 1,
        lastUpdatedWeek: 1,
        eventIds: [],
        actorStates: [],
      },
      score: 10,
      relevantActorStates: [],
      linkedEvents: [],
    };
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const result = buildPromoScreenplayInput(SAMPLE_PROMO_SEGMENT, wrestlers, SAMPLE_ANNOUNCERS, [thread]);
    expect(result.relevantThreads).toHaveLength(1);
    expect(result.relevantThreads[0].thread.threadId).toBe('t-promo');
  });
});

describe('buildAnnouncerScreenplayInput', () => {
  it('passes match beats and announcers through to the input', () => {
    const beats: MatchBeats = {
      segmentId: 's-001',
      beats: [
        { order: 1, type: 'action', actor: 'w-001', description: 'clothesline', durationMs: 0 },
        { order: 2, type: 'finish', actor: 'w-001', description: 'Dominion Driver', durationMs: 0 },
      ],
      result: { winner: 'w-001', finishType: 'clean', crowdReaction: 'hot' },
    };
    const result = buildAnnouncerScreenplayInput(beats, SAMPLE_ANNOUNCERS);
    expect(result.matchBeats.segmentId).toBe('s-001');
    expect(result.announcers).toHaveLength(1);
    expect(result.announcers[0].name).toBe('Brock Calloway');
  });
});

const THREAD_WITH_WRESTLER: SocialThread = {
  threadId: 't-001',
  title: 'Rex vs Steel Conflict',
  subjects: ['w-001', 'w-002'],
  tags: ['conflict'],
  createdWeek: 1,
  lastUpdatedWeek: 1,
  eventIds: [],
  actorStates: [
    { wrestlerId: 'w-001', care: 8, stance: 'aggrieved', summary: 'Rex sees this as unfinished business' },
    { wrestlerId: 'w-002', care: 3, stance: 'dismissive', summary: 'Steel barely remembers it' },
  ],
};

const THREAD_UNRELATED: SocialThread = {
  threadId: 't-002',
  title: 'Unrelated Thread',
  subjects: ['w-003', 'w-004'],
  tags: ['conflict'],
  createdWeek: 1,
  lastUpdatedWeek: 1,
  eventIds: [],
  actorStates: [],
};

const SUBMISSION_W001: WeeklySubmission = {
  submissionId: 's-001',
  managerId: 'm-001',
  week: 2,
  showRequest: 'I want revenge on Steel.',
  bribeAmount: 200,
  storyRequests: [{ type: 'feud', target: 'w-002', bribeAmount: 200 }],
  wrestlerMessage: 'I want revenge on Steel.',
  submittedAt: '2026-04-01T10:00:00Z',
};

describe('buildWrestlerThoughtProcessInput', () => {
  it('includes only threads where the wrestler is a subject', () => {
    const wrestler = makeWrestler('w-001');
    const result = buildWrestlerThoughtProcessInput(wrestler, SUBMISSION_W001, [THREAD_WITH_WRESTLER, THREAD_UNRELATED]);
    expect(result.activeThreads).toHaveLength(1);
    expect(result.activeThreads[0].threadId).toBe('t-001');
  });

  it('includes threads where the wrestler appears in actorStates but not subjects', () => {
    const threadActorOnly: SocialThread = {
      ...THREAD_UNRELATED,
      threadId: 't-003',
      subjects: ['w-003'],
      actorStates: [{ wrestlerId: 'w-001', care: 4, stance: 'curious', summary: 'Rex is watching' }],
    };
    const wrestler = makeWrestler('w-001');
    const result = buildWrestlerThoughtProcessInput(wrestler, undefined, [threadActorOnly]);
    expect(result.activeThreads).toHaveLength(1);
    expect(result.activeThreads[0].threadId).toBe('t-003');
  });

  it('maps submission wrestlerMessage and storyRequests', () => {
    const wrestler = makeWrestler('w-001');
    const result = buildWrestlerThoughtProcessInput(wrestler, SUBMISSION_W001, []);
    expect(result.submission?.wrestlerMessage).toBe('I want revenge on Steel.');
    expect(result.submission?.storyRequests).toHaveLength(1);
    expect(result.submission?.storyRequests[0].type).toBe('feud');
  });

  it('sets submission to null when no submission provided', () => {
    const wrestler = makeWrestler('w-001');
    const result = buildWrestlerThoughtProcessInput(wrestler, undefined, []);
    expect(result.submission).toBeNull();
  });

  it('maps wrestler identity fields', () => {
    const wrestler = makeWrestler('w-001');
    const result = buildWrestlerThoughtProcessInput(wrestler, undefined, []);
    expect(result.wrestler.wrestlerId).toBe('w-001');
    expect(result.wrestler.personality).toEqual(wrestler.personality);
    expect(result.wrestler.emotionalState).toEqual(wrestler.emotionalState);
  });
});
