import { randomUUID } from 'node:crypto';
import type { Wrestler, MatchResult, FinishType, CrowdReaction } from '@org/wrastlin-shared';

interface MatchContext {
  rivalryHeat?: number;      // 0-10, defaults to 0
  managerAdviceTarget?: string;
}

function score(w: Wrestler): number {
  const statScore = (w.stats.strength + w.stats.agility + w.stats.endurance + w.stats.charisma) / 4;
  const emotionModifier = (w.emotionalState.confidence - w.emotionalState.fatigue) * 2;
  const frustrationPenalty = w.emotionalState.frustration * 1.5;
  return statScore + emotionModifier - frustrationPenalty;
}

function pickFinishType(winner: Wrestler, loser: Wrestler, rivalryHeat: number): FinishType {
  const heelTendency = (10 - winner.personality.honor) / 10;
  const rand = Math.random();

  if (rivalryHeat >= 8 && rand < 0.3) return 'dq';
  if (heelTendency > 0.7 && rand < 0.35) return 'dirty';
  if (winner.personality.anger >= 8 && rand < 0.2) return 'count-out';
  return 'clean';
}

function crowdReaction(winner: Wrestler, finishType: FinishType, rivalryHeat: number): CrowdReaction {
  const excitement = (winner.stats.charisma / 100) + (rivalryHeat / 10);
  if (finishType === 'dq' || finishType === 'no-contest') return 'lukewarm';
  if (excitement > 0.7) return 'hot';
  if (excitement > 0.4) return 'lukewarm';
  return 'dead';
}

export function resolveMatch(
  a: Wrestler,
  b: Wrestler,
  ctx: MatchContext = {}
): MatchResult {
  const scoreA = score(a);
  const scoreB = score(b);
  const total = scoreA + scoreB;
  const rand = Math.random() * total;

  const winner = rand < scoreA ? a : b;
  const loser = winner === a ? b : a;
  const rivalryHeat = ctx.rivalryHeat ?? 0;

  const finishType = pickFinishType(winner, loser, rivalryHeat);
  const reaction = crowdReaction(winner, finishType, rivalryHeat);

  const moments = [
    `${winner.name} dominated early with ${winner.personality.ego >= 7 ? 'arrogant taunts' : 'focused aggression'}.`,
    `${loser.name} fought back but ${finishType === 'clean' ? "couldn't overcome the difference in momentum" : 'the match ended controversially'}.`,
  ];

  return {
    matchId: randomUUID(),
    participants: [a.wrestlerId, b.wrestlerId],
    winner: winner.wrestlerId,
    finishType,
    crowdReaction: reaction,
    moments,
    narration: moments.join(' '),
  };
}
