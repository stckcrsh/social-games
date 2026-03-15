import type { PromoScreenplayAgentFn, PromoScreenplay } from '../types.js';

export const stubPromoScreenplayAgent: PromoScreenplayAgentFn = async (input): Promise<PromoScreenplay> => {
  const participantName = input.participants[0]?.name ?? 'Unknown';
  const targetName = input.target?.name ?? null;
  const line = targetName
    ? `You think you can beat me, ${targetName}? Not a chance.`
    : `Nobody in this company is on my level.`;
  return {
    segmentId: input.segment.segmentId,
    actors: [{ name: participantName, role: 'wrestler' }],
    screenplay: `[${participantName.toUpperCase()}]: ${line}\n\nACTORS: ${participantName} (wrestler)`,
  };
};
