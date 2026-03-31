import { describe, it, expect } from 'vitest';
import type { Wrestler, Manager, WeeklySubmission, Announcer } from '@org/wrastlin-shared';
import type { MatchOutlineSegment, PromoOutlineSegment, MatchBeats } from './types.js';
import {
  buildShowOutlineInput,
  buildMatchBeatsInput,
  buildPromoScreenplayInput,
  buildAnnouncerScreenplayInput,
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
    const result = buildShowOutlineInput(1, wrestlers, [], [], []);
    expect(result.wrestlers).toHaveLength(2);
    expect(result.wrestlers[0].wrestlerId).toBe('w-001');
  });

  it('joins wrestler ID onto submission via manager and maps showRequest and bribeAmount', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const managers = [makeManager('m-001', 'w-001')];
    const submissions = [makeSubmission('m-001', 1, { showRequest: 'Main event please', bribeAmount: 500 })];
    const result = buildShowOutlineInput(1, wrestlers, managers, submissions, []);
    expect(result.submissions[0].wrestlerId).toBe('w-001');
    expect(result.submissions[0].managerId).toBe('m-001');
    expect(result.submissions[0].showRequest).toBe('Main event please');
    expect(result.submissions[0].bribeAmount).toBe(500);
  });

  it('omits submissions whose manager does not match any manager', () => {
    const wrestlers = [makeWrestler('w-001')];
    const managers = [makeManager('m-001', 'w-001')];
    const submissions = [makeSubmission('m-999', 1)];  // unknown manager
    const result = buildShowOutlineInput(1, wrestlers, managers, submissions, []);
    expect(result.submissions).toHaveLength(0);
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
    const result = buildPromoScreenplayInput(SAMPLE_PROMO_SEGMENT, wrestlers, SAMPLE_ANNOUNCERS);
    expect(result.participants.map(p => p.wrestlerId)).toEqual(['w-001']);
  });

  it('returns target when segment has a target', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const result = buildPromoScreenplayInput(SAMPLE_PROMO_SEGMENT, wrestlers, SAMPLE_ANNOUNCERS);
    expect(result.target).not.toBeNull();
    expect(result.target!.wrestlerId).toBe('w-002');
  });

  it('returns null target for self-hype promos', () => {
    const promoNoTarget: PromoOutlineSegment = { ...SAMPLE_PROMO_SEGMENT, target: undefined };
    const wrestlers = [makeWrestler('w-001')];
    const result = buildPromoScreenplayInput(promoNoTarget, wrestlers, SAMPLE_ANNOUNCERS);
    expect(result.target).toBeNull();
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
