import { describe, it, expect, vi, beforeAll } from 'vitest';
import path from 'node:path';

beforeAll(() => {
  process.env['PROMPTS_DIR'] = path.resolve(import.meta.dirname, '../../prompts');
});

vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content: JSON.stringify({
            showId: 'test-id',
            week: 1,
            segments: [],
          }) } }],
        }),
      },
    };
  },
}));

import { createOpenAIShowOutlineAgent } from './openaiShowOutlineAgent.js';
import type { ShowOutlineInput } from './types.js';

const BASE_INPUT: ShowOutlineInput = {
  week: 1,
  previousOutlines: [],
  wrestlers: [{ wrestlerId: 'w-001', name: 'Rex Thunder', gimmick: 'Powerhouse', emotionalState: { confidence: 7, frustration: 2, fatigue: 3 } }],
  submissions: [],
  wrestlerThoughtProcess: [{ wrestlerId: 'w-001', thoughtSummary: 'Rex wants revenge.', threadUpdates: [] }],
  relevantThreads: [{
    thread: { threadId: 't-001', title: 'Rex vs Steel Feud', subjects: ['w-001'], tags: ['feud'], createdWeek: 1, lastUpdatedWeek: 1, eventIds: [], actorStates: [] },
    score: 15,
    relevantActorStates: [],
    linkedEvents: [],
  }],
};

describe('createOpenAIShowOutlineAgent', () => {
  it('includes wrestler thought summaries in the prompt', async () => {
    let capturedPrompt = '';
    const agent = createOpenAIShowOutlineAgent('test-key', (p) => { capturedPrompt = p; });
    await agent(BASE_INPUT);
    expect(capturedPrompt).toContain('Rex wants revenge.');
  });

  it('includes active thread titles in the prompt', async () => {
    let capturedPrompt = '';
    const agent = createOpenAIShowOutlineAgent('test-key', (p) => { capturedPrompt = p; });
    await agent(BASE_INPUT);
    expect(capturedPrompt).toContain('Rex vs Steel Feud');
  });
});
