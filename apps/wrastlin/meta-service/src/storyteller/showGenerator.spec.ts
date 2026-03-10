import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as gameState from '../core/gameState.js';
import { generateShow } from './showGenerator.js';
import type { Wrestler, WeeklyState } from '@org/wrastlin-shared';

const wrestlers: Wrestler[] = [
  {
    wrestlerId: 'w-a', name: 'Wrestler A', gimmick: 'Face',
    stats: { strength: 70, agility: 70, endurance: 70, charisma: 70 },
    personality: { ego: 3, anger: 3, honor: 8, loyalty: 7, ambition: 5 },
    emotionalState: { confidence: 7, frustration: 3, fatigue: 3 },
    relationships: [], memories: [], managerTrust: 7,
  },
  {
    wrestlerId: 'w-b', name: 'Wrestler B', gimmick: 'Heel',
    stats: { strength: 75, agility: 65, endurance: 70, charisma: 65 },
    personality: { ego: 8, anger: 7, honor: 2, loyalty: 3, ambition: 8 },
    emotionalState: { confidence: 8, frustration: 4, fatigue: 4 },
    relationships: [], memories: [], managerTrust: 4,
  },
];

const state: WeeklyState = { currentWeek: 1, phase: 'submissions_closed', updatedAt: '' };

beforeEach(() => {
  vi.spyOn(gameState, 'loadWrestlers').mockReturnValue(wrestlers);
  vi.spyOn(gameState, 'loadManagers').mockReturnValue([]);
  vi.spyOn(gameState, 'loadSubmissions').mockReturnValue([]);
  vi.spyOn(gameState, 'loadState').mockReturnValue(state);
  vi.spyOn(gameState, 'saveWrestlers').mockImplementation(() => {});
  vi.spyOn(gameState, 'saveState').mockImplementation(() => {});
});

describe('generateShow', () => {
  it('returns a show with at least one segment', () => {
    const show = generateShow();
    expect(show.segments.length).toBeGreaterThan(0);
  });

  it('has a crowd reaction', () => {
    const show = generateShow();
    expect(['hot', 'lukewarm', 'dead']).toContain(show.crowdReaction);
  });

  it('every match result references valid wrestler ids', () => {
    const ids = new Set(wrestlers.map(w => w.wrestlerId));
    const show = generateShow();
    for (const seg of show.segments) {
      if (seg.matchResult) {
        expect(ids.has(seg.matchResult.winner)).toBe(true);
      }
    }
  });
});
