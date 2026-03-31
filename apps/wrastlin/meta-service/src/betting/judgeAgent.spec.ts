import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BetProposition, Show, Wrestler } from '@org/wrastlin-shared';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

const { judgeProposition } = await import('./judgeAgent.js');

const proposition: BetProposition = {
  propositionId: 'prop-1',
  week: 1,
  createdBy: 'm-001',
  statement: 'slick vince wins his match',
  options: [
    { optionId: 'opt-win', label: 'slick vince wins' },
    { optionId: 'opt-lose', label: 'slick vince loses' },
  ],
  createdAt: '2026-03-30T10:00:00.000Z',
};

const show = {
  showOutline: { showId: 'show-1', week: 1, segments: [] },
  segments: [],
} as unknown as Show;

const wrestlers: Wrestler[] = [
  {
    wrestlerId: 'w-003',
    name: 'Slick Vince',
    gimmick: 'The Cowardly Schemer',
    stats: { strength: 50, agility: 85, endurance: 55, charisma: 80 },
    personality: { ego: 6, anger: 3, honor: 1, loyalty: 2, ambition: 7 },
    emotionalState: { confidence: 5, frustration: 6, fatigue: 3 },
    managerTrust: 5,
    finisher: 'Low Blow',
  },
];

const okResponse = {
  choices: [{
    message: {
      content: JSON.stringify({
        winningOptionIds: ['opt-win'],
        rationale: 'Slick Vince (w-003) won cleanly.',
        confidence: 'clear',
      }),
    },
  }],
};

describe('judgeProposition', () => {
  beforeEach(() => { mockCreate.mockReset(); });

  it('includes wrestler name-to-id roster in the prompt', async () => {
    mockCreate.mockResolvedValue(okResponse);

    await judgeProposition(proposition, show, wrestlers);

    const prompt: string = mockCreate.mock.calls[0][0].messages[0].content;
    expect(prompt).toContain('Slick Vince');
    expect(prompt).toContain('w-003');
  });

  it('returns parsed judgement from the model response', async () => {
    mockCreate.mockResolvedValue(okResponse);

    const result = await judgeProposition(proposition, show, wrestlers);

    expect(result.winningOptionIds).toEqual(['opt-win']);
    expect(result.confidence).toBe('clear');
  });

  it('throws when response has no content', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: { content: null } }] });

    await expect(judgeProposition(proposition, show, wrestlers)).rejects.toThrow('Empty response');
  });
});
