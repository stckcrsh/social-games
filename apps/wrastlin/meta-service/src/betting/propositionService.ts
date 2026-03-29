import { randomUUID } from 'crypto';
import { loadPropositions, savePropositions } from './persistence.js';
import type { BetProposition, BetOption } from '@org/wrastlin-shared';

export { loadPropositions };

export function createProposition(
  week: number,
  createdBy: string,
  statement: string,
  options: Pick<BetOption, 'label'>[],
): BetProposition {
  if (options.length < 2) {
    throw new Error('A proposition requires at least 2 options');
  }

  const proposition: BetProposition = {
    propositionId: randomUUID(),
    week,
    createdBy,
    statement,
    options: options.map(o => ({ optionId: randomUUID(), label: o.label })),
    createdAt: new Date().toISOString(),
  };

  const existing = loadPropositions(week);
  savePropositions(week, [...existing, proposition]);
  return proposition;
}
