import type { BetProposition } from './types.js';

// Both `now` and `closesAt` must be full ISO 8601 strings (e.g. '2026-03-10T12:00:00Z')
// for the lexicographic comparison to work correctly.
export function isPropositionAcceptingBets(
  proposition: BetProposition,
  now: string,
  gamePhase: string
): boolean {
  if (proposition.status !== 'open') return false;
  if (now >= proposition.closesAt) return false;
  if (gamePhase !== 'week_open') return false;
  return true;
}
