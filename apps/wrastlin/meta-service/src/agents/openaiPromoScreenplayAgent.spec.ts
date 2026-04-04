import { describe, it, expect, vi, beforeAll } from 'vitest';
import path from 'node:path';

beforeAll(() => {
  process.env['PROMPTS_DIR'] = path.resolve(import.meta.dirname, '../../prompts');
});

const MOCK_SCREENPLAY = `[REX THUNDER]: You think you can beat me, Steel? Not in this lifetime.
[BROCK CALLOWAY]: Strong words from Rex Thunder!

ACTORS: Rex Thunder (wrestler), Brock Calloway (interviewer)`;

vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: MOCK_SCREENPLAY } }],
        }),
      },
    };
  },
}));

import { createOpenAIPromoScreenplayAgent } from './openaiPromoScreenplayAgent.js';
import type { PromoScreenplayInput } from './types.js';

const BASE_INPUT: PromoScreenplayInput = {
  segment: {
    segmentId: 'seg-001',
    order: 1,
    type: 'promo',
    participants: ['w-001'],
    goal: 'hype Rex for the main event',
  },
  participants: [{
    wrestlerId: 'w-001',
    name: 'Rex Thunder',
    gimmick: 'Powerhouse',
    personality: { ego: 8, anger: 6, honor: 5, loyalty: 4, ambition: 7 },
    emotionalState: { confidence: 8, frustration: 3, fatigue: 2 },
  }],
  target: null,
  personas: [],
  relevantThreads: [],
};

describe('createOpenAIPromoScreenplayAgent', () => {
  it('returns a PromoScreenplay with the correct segmentId', async () => {
    const agent = createOpenAIPromoScreenplayAgent('test-key');
    const result = await agent(BASE_INPUT);
    expect(result.segmentId).toBe('seg-001');
  });

  it('parses actors from the ACTORS: line', async () => {
    const agent = createOpenAIPromoScreenplayAgent('test-key');
    const result = await agent(BASE_INPUT);
    expect(result.actors).toHaveLength(2);
    expect(result.actors[0].name).toBe('Rex Thunder');
    expect(result.actors[0].role).toBe('wrestler');
    expect(result.actors[1].name).toBe('Brock Calloway');
    expect(result.actors[1].role).toBe('interviewer');
  });

  it('includes screenplay text', async () => {
    const agent = createOpenAIPromoScreenplayAgent('test-key');
    const result = await agent(BASE_INPUT);
    expect(result.screenplay).toContain('[REX THUNDER]:');
  });

  it('includes relevant thread title in the rendered prompt', async () => {
    let capturedPrompt = '';
    const inputWithThread: PromoScreenplayInput = {
      ...BASE_INPUT,
      relevantThreads: [{
        thread: { threadId: 't-001', title: 'Rex vs Steel Rivalry', subjects: ['w-001'], tags: ['rivalry'], createdWeek: 1, lastUpdatedWeek: 2, eventIds: [], actorStates: [] },
        score: 12,
        relevantActorStates: [],
        linkedEvents: [],
      }],
    };

    const agent = createOpenAIPromoScreenplayAgent('test-key', (p) => { capturedPrompt = p; });
    await agent(inputWithThread);
    expect(capturedPrompt).toContain('Rex vs Steel Rivalry');
  });
});
