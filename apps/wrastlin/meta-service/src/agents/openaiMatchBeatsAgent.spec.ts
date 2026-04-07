import { describe, it, expect, vi, beforeAll } from 'vitest';
import path from 'node:path';

beforeAll(() => {
  process.env['PROMPTS_DIR'] = path.resolve(import.meta.dirname, '../../prompts');
});

const MOCK_BEATS_RESPONSE = JSON.stringify({
  segmentId: 'seg-001',
  beats: [
    { order: 1, type: 'action', actor: 'w-001', description: 'Rex opens with a clothesline', durationMs: 0 },
    { order: 2, type: 'action', actor: 'w-002', description: 'Steel fires back with a suplex', durationMs: 0 },
    { order: 3, type: 'near-finish', actor: 'w-001', description: 'Rex covers — two count', durationMs: 0 },
    { order: 4, type: 'pause', actor: null, description: 'crowd erupts', durationMs: 1500 },
    { order: 5, type: 'finish', actor: 'w-002', description: 'Steel locks in the Honor Lock for the tap-out', durationMs: 0 },
  ],
  result: {
    winner: 'w-002',
    finishType: 'clean',
    crowdReaction: 'hot',
  },
});

vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: MOCK_BEATS_RESPONSE } }],
        }),
      },
    };
  },
}));

import { createOpenAIMatchBeatsAgent } from './openaiMatchBeatsAgent.js';
import type { MatchBeatsInput } from './types.js';

const BASE_INPUT: MatchBeatsInput = {
  segment: {
    segmentId: 'seg-001',
    order: 2,
    type: 'match',
    matchType: 'singles',
    participants: [['w-001'], ['w-002']],
    interference: [],
    headliner: false,
  },
  wrestlers: [
    {
      wrestlerId: 'w-001',
      name: 'Rex Dominion',
      gimmick: 'The Arrogant Champion',
      stats: { strength: 80, agility: 60, endurance: 75, charisma: 70 },
      personality: { ego: 9, anger: 7, honor: 2, loyalty: 3, ambition: 8 },
      emotionalState: { confidence: 9, frustration: 2, fatigue: 3 },
      finisher: 'Dominion Driver',
    },
    {
      wrestlerId: 'w-002',
      name: 'Steel Purity',
      gimmick: 'The Honorable Warrior',
      stats: { strength: 75, agility: 65, endurance: 80, charisma: 65 },
      personality: { ego: 3, anger: 4, honor: 10, loyalty: 8, ambition: 5 },
      emotionalState: { confidence: 7, frustration: 3, fatigue: 4 },
      finisher: 'Honor Lock',
    },
  ],
};

describe('createOpenAIMatchBeatsAgent', () => {
  it('returns MatchBeats with the correct segmentId', async () => {
    const agent = createOpenAIMatchBeatsAgent('test-key');
    const result = await agent(BASE_INPUT);
    expect(result.segmentId).toBe('seg-001');
  });

  it('returns beats array with correct length', async () => {
    const agent = createOpenAIMatchBeatsAgent('test-key');
    const result = await agent(BASE_INPUT);
    expect(result.beats).toHaveLength(5);
  });

  it('returns result with winner, finishType, and crowdReaction', async () => {
    const agent = createOpenAIMatchBeatsAgent('test-key');
    const result = await agent(BASE_INPUT);
    expect(result.result.winner).toBe('w-002');
    expect(result.result.finishType).toBe('clean');
    expect(result.result.crowdReaction).toBe('hot');
  });

  it('includes segment id in the rendered prompt', async () => {
    let capturedPrompt = '';
    const agent = createOpenAIMatchBeatsAgent('test-key', (p) => { capturedPrompt = p; });
    await agent(BASE_INPUT);
    expect(capturedPrompt).toContain('seg-001');
  });
});
