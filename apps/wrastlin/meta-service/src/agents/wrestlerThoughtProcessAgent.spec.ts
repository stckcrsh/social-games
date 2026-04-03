import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import type { WrestlerThoughtProcessInput, WrestlerThoughtProcessOutput } from './types.js';
import { createOpenAIWrestlerThoughtProcessAgent } from './openaiWrestlerThoughtProcessAgent.js';

// Point loadPrompt at the real prompts directory (two levels up from src/agents/)
process.env.PROMPTS_DIR = path.resolve(import.meta.dirname, '../../prompts');

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

const INPUT: WrestlerThoughtProcessInput = {
  wrestler: {
    wrestlerId: 'w-001',
    name: 'Rex Dominion',
    gimmick: 'The Arrogant Champion',
    personality: { ego: 9, anger: 7, honor: 3, loyalty: 4, ambition: 10 },
    emotionalState: { confidence: 8, frustration: 6, fatigue: 3 },
  },
  submission: {
    wrestlerMessage: 'I want Steel gone for good.',
    storyRequests: [{ type: 'feud', target: 'w-002', bribeAmount: 300 }],
  },
  activeThreads: [
    {
      threadId: 't-001',
      title: 'Rex vs Steel Conflict',
      subjects: ['w-001', 'w-002'],
      tags: ['conflict'],
      createdWeek: 1,
      lastUpdatedWeek: 2,
      eventIds: ['e-001'],
      actorStates: [
        { wrestlerId: 'w-001', care: 7, stance: 'aggrieved', summary: 'Rex wants revenge' },
      ],
    },
  ],
};

const VALID_OUTPUT: WrestlerThoughtProcessOutput = {
  wrestlerId: 'w-001',
  thoughtSummary: 'Rex is consumed by his rivalry with Steel and wants to end it definitively.',
  threadUpdates: [
    { threadId: 't-001', care: 9, stance: 'vengeful', summary: 'Rex sees this as the most important thing in his career right now.' },
  ],
};

beforeEach(() => {
  mockCreate.mockReset();
});

describe('createOpenAIWrestlerThoughtProcessAgent', () => {
  it('returns parsed thought process output from model response', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_OUTPUT) } }],
    });

    const agent = createOpenAIWrestlerThoughtProcessAgent('test-key');
    const result = await agent(INPUT);

    expect(result.wrestlerId).toBe('w-001');
    expect(result.thoughtSummary).toBe(VALID_OUTPUT.thoughtSummary);
    expect(result.threadUpdates).toHaveLength(1);
    expect(result.threadUpdates[0].care).toBe(9);
    expect(result.threadUpdates[0].stance).toBe('vengeful');
  });

  it('includes wrestler name in the prompt', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_OUTPUT) } }],
    });

    const agent = createOpenAIWrestlerThoughtProcessAgent('test-key');
    await agent(INPUT);

    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Rex Dominion');
  });

  it('includes active thread title in the prompt', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_OUTPUT) } }],
    });

    const agent = createOpenAIWrestlerThoughtProcessAgent('test-key');
    await agent(INPUT);

    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Rex vs Steel Conflict');
  });

  it('includes wrestler message in the prompt', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify(VALID_OUTPUT) } }],
    });

    const agent = createOpenAIWrestlerThoughtProcessAgent('test-key');
    await agent(INPUT);

    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('I want Steel gone for good.');
  });

  it('uses fallback message when no submission', async () => {
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ ...VALID_OUTPUT, threadUpdates: [] }) } }],
    });

    const agent = createOpenAIWrestlerThoughtProcessAgent('test-key');
    await agent({ ...INPUT, submission: null });

    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('No message submitted this week');
  });

  it('throws when response has no content', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });

    const agent = createOpenAIWrestlerThoughtProcessAgent('test-key');
    await expect(agent(INPUT)).rejects.toThrow();
  });
});
