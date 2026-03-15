import { describe, it, expect } from 'vitest';
import type { Wrestler, Manager, WeeklySubmission, Announcer } from '@org/wrastlin-shared';
import type { MatchOutlineSegment, PromoOutlineSegment, MatchBeats } from './types.js';
import {
  computeRivalryHeat,
  buildShowOutlineInput,
  buildMatchBeatsInput,
  buildPromoScreenplayInput,
  buildAnnouncerScreenplayInput,
} from './dataBuilders.js';

// Minimal fixture helper — only fields relevant to rivalry heat
function makeWrestler(id: string, relationships: Wrestler['relationships'] = []): Wrestler {
  return {
    wrestlerId: id,
    name: `Wrestler ${id}`,
    gimmick: 'Test Gimmick',
    stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
    personality: { ego: 5, anger: 5, honor: 5, loyalty: 5, ambition: 5 },
    emotionalState: { confidence: 5, frustration: 5, fatigue: 5 },
    relationships,
    memories: [],
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
    advice: { matchStyle: 'technical' },
    storyRequests: [],
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

describe('computeRivalryHeat', () => {
  it('returns 0 when neither wrestler has a relationship', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    expect(computeRivalryHeat(wrestlers, 'w-001', 'w-002')).toBe(0);
  });

  it('returns the average of mutual hatred rounded to nearest integer', () => {
    const wrestlers = [
      makeWrestler('w-001', [{ wrestlerId: 'w-002', hatred: 8, respect: 2, trust: 1 }]),
      makeWrestler('w-002', [{ wrestlerId: 'w-001', hatred: 6, respect: 3, trust: 2 }]),
    ];
    expect(computeRivalryHeat(wrestlers, 'w-001', 'w-002')).toBe(7); // (8+6)/2 = 7
  });

  it('returns half of one-sided hatred when the other side has no relationship entry', () => {
    const wrestlers = [
      makeWrestler('w-001', [{ wrestlerId: 'w-002', hatred: 8, respect: 2, trust: 1 }]),
      makeWrestler('w-002', []),
    ];
    expect(computeRivalryHeat(wrestlers, 'w-001', 'w-002')).toBe(4); // (8+0)/2 = 4
  });

  it('rounds 0.5 up', () => {
    const wrestlers = [
      makeWrestler('w-001', [{ wrestlerId: 'w-002', hatred: 7, respect: 2, trust: 1 }]),
      makeWrestler('w-002', [{ wrestlerId: 'w-001', hatred: 8, respect: 3, trust: 2 }]),
    ];
    expect(computeRivalryHeat(wrestlers, 'w-001', 'w-002')).toBe(8); // (7+8)/2 = 7.5 → 8
  });
});

describe('buildShowOutlineInput', () => {
  it('includes a rivalryHeat map on each wrestler', () => {
    const wrestlers = [
      makeWrestler('w-001', [{ wrestlerId: 'w-002', hatred: 8, respect: 2, trust: 1 }]),
      makeWrestler('w-002', [{ wrestlerId: 'w-001', hatred: 6, respect: 3, trust: 2 }]),
    ];
    const result = buildShowOutlineInput(1, wrestlers, [], [], []);
    expect(result.wrestlers[0].rivalryHeat['w-002']).toBe(7);
    expect(result.wrestlers[1].rivalryHeat['w-001']).toBe(7);
  });

  it('joins wrestler ID onto submission via manager', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const managers = [makeManager('m-001', 'w-001')];
    const submissions = [makeSubmission('m-001', 1)];
    const result = buildShowOutlineInput(1, wrestlers, managers, submissions, []);
    expect(result.submissions[0].wrestlerId).toBe('w-001');
    expect(result.submissions[0].managerId).toBe('m-001');
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
    const result = buildMatchBeatsInput(segment, wrestlers, [], []);
    expect(result.wrestlers.map(w => w.wrestlerId)).toEqual(['w-001', 'w-002']);
  });

  it('includes interference wrestler in the payload', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002'), makeWrestler('w-003')];
    const segment: MatchOutlineSegment = { ...SAMPLE_MATCH_SEGMENT, interference: ['w-003'] };
    const result = buildMatchBeatsInput(segment, wrestlers, [], []);
    expect(result.wrestlers.map(w => w.wrestlerId)).toContain('w-003');
  });

  it('merges matchStyle from manager submission when available', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const managers = [makeManager('m-001', 'w-001')];
    const submissions = [makeSubmission('m-001', 1, { advice: { matchStyle: 'heel' } })];
    const result = buildMatchBeatsInput(SAMPLE_MATCH_SEGMENT, wrestlers, managers, submissions);
    const w1 = result.wrestlers.find(w => w.wrestlerId === 'w-001')!;
    expect(w1.matchStyle).toBe('heel');
  });

  it('omits matchStyle when the wrestler has no manager submission', () => {
    const wrestlers = [makeWrestler('w-001'), makeWrestler('w-002')];
    const result = buildMatchBeatsInput(SAMPLE_MATCH_SEGMENT, wrestlers, [], []);
    const w1 = result.wrestlers.find(w => w.wrestlerId === 'w-001')!;
    expect(w1.matchStyle).toBeUndefined();
  });
});

describe('buildPromoScreenplayInput', () => {
  it('filters participant memories to the last 3 weeks', () => {
    const currentWeek = 5;
    const wrestlers = [
      makeWrestler('w-001'),
      makeWrestler('w-002'),
    ];
    // Give w-001 memories spanning weeks 1–5
    wrestlers[0].memories = [
      { memoryId: 'm1', type: 'victory', source: 'w-001', target: 'w-002', week: 1, intensity: 5 },
      { memoryId: 'm2', type: 'humiliation', source: 'w-003', target: 'w-001', week: 3, intensity: 7 },
      { memoryId: 'm3', type: 'betrayal', source: 'w-001', target: 'w-002', week: 5, intensity: 9 },
    ];
    const result = buildPromoScreenplayInput(SAMPLE_PROMO_SEGMENT, wrestlers, currentWeek, []);
    const participant = result.participants.find(p => p.wrestlerId === 'w-001')!;
    // Only weeks 3–5 (>= currentWeek - 2) should be included
    expect(participant.memories.map(m => m.week)).not.toContain(1);
    expect(participant.memories.map(m => m.week)).toContain(3);
    expect(participant.memories.map(m => m.week)).toContain(5);
  });

  it('returns target with shared memories when segment has a target', () => {
    const wrestlers = [
      makeWrestler('w-001'),
      makeWrestler('w-002'),
    ];
    wrestlers[1].memories = [
      { memoryId: 'm1', type: 'humiliation', source: 'w-001', target: 'w-002', week: 4, intensity: 8 },
      { memoryId: 'm2', type: 'victory', source: 'w-003', target: 'w-002', week: 4, intensity: 5 },
    ];
    const result = buildPromoScreenplayInput(SAMPLE_PROMO_SEGMENT, wrestlers, 5, []);
    expect(result.target).not.toBeNull();
    expect(result.target!.wrestlerId).toBe('w-002');
    // m1 involves participant w-001; m2 does not
    expect(result.target!.sharedMemories.map(m => m.memoryId)).toContain('m1');
    expect(result.target!.sharedMemories.map(m => m.memoryId)).not.toContain('m2');
  });

  it('returns null target for self-hype promos', () => {
    const promoNoTarget: PromoOutlineSegment = { ...SAMPLE_PROMO_SEGMENT, target: undefined };
    const wrestlers = [makeWrestler('w-001')];
    const result = buildPromoScreenplayInput(promoNoTarget, wrestlers, 5, []);
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
