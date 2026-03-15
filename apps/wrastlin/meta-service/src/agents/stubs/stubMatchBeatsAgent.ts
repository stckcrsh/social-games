import type { MatchBeatsAgentFn, MatchBeats } from '../types.js';

export const stubMatchBeatsAgent: MatchBeatsAgentFn = async (input): Promise<MatchBeats> => {
  const [p1, p2] = input.segment.participants;
  return {
    segmentId: input.segment.segmentId,
    beats: [
      { order: 1, type: 'action', actor: p1, description: `${p1} opens with a running attack`, durationMs: 0 },
      { order: 2, type: 'action', actor: p2, description: `${p2} fires back with a suplex`, durationMs: 0 },
      { order: 3, type: 'near-finish', actor: p1, description: `${p1} covers — two count`, durationMs: 0 },
      { order: 4, type: 'pause', actor: null, description: 'crowd pops', durationMs: 1500 },
      { order: 5, type: 'finish', actor: p1, description: `${p1} hits the finisher for the win`, durationMs: 0 },
    ],
    result: {
      winner: p1,
      finishType: 'clean',
      crowdReaction: 'hot',
    },
  };
};
