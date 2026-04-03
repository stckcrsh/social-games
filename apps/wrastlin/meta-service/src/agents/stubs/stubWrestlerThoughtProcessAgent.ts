import type { WrestlerThoughtProcessAgentFn } from '../types.js';

export const stubWrestlerThoughtProcessAgent: WrestlerThoughtProcessAgentFn = async (input) => {
  return {
    wrestlerId: input.wrestler.wrestlerId,
    thoughtSummary: `${input.wrestler.name} is focused and ready for this week's show.`,
    threadUpdates: input.activeThreads.map(t => ({
      threadId: t.threadId,
      care: 5,
      stance: 'focused',
      summary: `${input.wrestler.name} is keeping this situation in mind.`,
    })),
  };
};
