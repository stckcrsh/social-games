import { describe, it, expect, vi } from 'vitest';
import type { Wrestler, Manager, Announcer } from '@org/wrastlin-shared';
import type { GeneratedMatchSegment, GeneratedPromoSegment } from './types.js';
import { runShowPipeline } from './pipeline.js';
import { stubShowOutlineAgent } from './stubs/stubShowOutlineAgent.js';
import { stubMatchBeatsAgent } from './stubs/stubMatchBeatsAgent.js';
import { stubPromoScreenplayAgent } from './stubs/stubPromoScreenplayAgent.js';
import { stubAnnouncerScreenplayAgent } from './stubs/stubAnnouncerScreenplayAgent.js';
import { buildShowOutlineInput } from './dataBuilders.js';

const STUB_AGENTS = {
  showOutline: stubShowOutlineAgent,
  matchBeats: stubMatchBeatsAgent,
  promoScreenplay: stubPromoScreenplayAgent,
  announcerScreenplay: stubAnnouncerScreenplayAgent,
};

function makeWrestler(id: string): Wrestler {
  return {
    wrestlerId: id,
    name: `Wrestler ${id}`,
    gimmick: 'Test',
    stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
    personality: { ego: 5, anger: 5, honor: 5, loyalty: 5, ambition: 5 },
    emotionalState: { confidence: 5, frustration: 5, fatigue: 5 },
    relationships: [],
    memories: [],
    managerTrust: 5,
    finisher: 'Test Finisher',
  };
}

const WRESTLERS = ['w-001', 'w-002', 'w-003', 'w-004'].map(makeWrestler);
const MANAGERS: Manager[] = [];
const ANNOUNCERS: Announcer[] = [
  {
    announcerId: 'a-001',
    name: 'Brock Calloway',
    role: 'play-by-play',
    theme: 'Energetic',
    catchphrases: [],
  },
];

describe('runShowPipeline', () => {
  it('calls the show outline agent once and returns a GeneratedShow', async () => {
    const outlineSpy = vi.fn(stubShowOutlineAgent);
    const result = await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: { ...STUB_AGENTS, showOutline: outlineSpy },
    });
    expect(outlineSpy).toHaveBeenCalledTimes(1);
    expect(result.showOutline.week).toBe(1);
  });

  it('calls match beats agent once per match segment', async () => {
    const beatsSpy = vi.fn(stubMatchBeatsAgent);
    await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: { ...STUB_AGENTS, matchBeats: beatsSpy },
    });
    // stub outline has 2 match segments
    expect(beatsSpy).toHaveBeenCalledTimes(2);
  });

  it('calls promo screenplay agent once per promo segment', async () => {
    const promoSpy = vi.fn(stubPromoScreenplayAgent);
    await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: { ...STUB_AGENTS, promoScreenplay: promoSpy },
    });
    // stub outline has 1 promo segment
    expect(promoSpy).toHaveBeenCalledTimes(1);
  });

  it('calls announcer screenplay agent once per match segment (after beats)', async () => {
    const announcerSpy = vi.fn(stubAnnouncerScreenplayAgent);
    await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: { ...STUB_AGENTS, announcerScreenplay: announcerSpy },
    });
    expect(announcerSpy).toHaveBeenCalledTimes(2);
  });

  it('generated match segments have beats and announcer screenplay', async () => {
    const result = await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: STUB_AGENTS,
    });
    const matchSegments = result.segments.filter(
      (s): s is GeneratedMatchSegment => s.type === 'match',
    );
    expect(matchSegments).toHaveLength(2);
    for (const seg of matchSegments) {
      expect(seg.beats).toBeDefined();
      expect(seg.announcerScreenplay).toBeDefined();
    }
  });

  it('generated promo segments have a promo screenplay', async () => {
    const result = await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: STUB_AGENTS,
    });
    const promoSegments = result.segments.filter(
      (s): s is GeneratedPromoSegment => s.type === 'promo',
    );
    expect(promoSegments).toHaveLength(1);
    expect(promoSegments[0].promoScreenplay).toBeDefined();
  });

  it('segments are ordered by the outline order field', async () => {
    const result = await runShowPipeline({
      showOutlineInput: buildShowOutlineInput(1, WRESTLERS, MANAGERS, [], []),
      wrestlers: WRESTLERS,
      managers: MANAGERS,
      submissions: [],
      announcers: ANNOUNCERS,
      agents: STUB_AGENTS,
    });
    const orders = result.segments.map(s => s.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
