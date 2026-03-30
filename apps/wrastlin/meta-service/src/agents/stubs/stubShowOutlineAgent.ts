import type { ShowOutlineAgentFn, ShowOutline } from '../types.js';

export const stubShowOutlineAgent: ShowOutlineAgentFn = async (input): Promise<ShowOutline> => {
  return {
    showId: 'stub-show-001',
    week: input.week,
    segments: [
      {
        segmentId: 'stub-seg-001',
        order: 1,
        type: 'promo',
        participants: ['w-001'],
        target: 'w-002',
        goal: 'Rex trash-talks Steel Purity to build heat',
      },
      {
        segmentId: 'stub-seg-002',
        order: 2,
        type: 'match',
        matchType: 'singles',
        participants: [['w-003'], ['w-004']],
        interference: [],
        headliner: false,
      },
      {
        segmentId: 'stub-seg-003',
        order: 3,
        type: 'match',
        matchType: 'cage',
        participants: [['w-001'], ['w-002']],
        interference: [],
        headliner: true,
      },
    ],
  };
};
