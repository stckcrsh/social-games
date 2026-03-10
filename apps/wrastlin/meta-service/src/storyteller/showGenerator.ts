import { randomUUID } from 'node:crypto';
import { loadWrestlers, loadSubmissions, loadState, saveWrestlers } from '../core/gameState.js';
import { resolveMatch } from './matchResolver.js';
import type { Show, Segment, CrowdReaction, Wrestler } from '@org/wrastlin-shared';

function templateNarration(type: string, participants: string[]): string {
  switch (type) {
    case 'opening-promo':
      return `${participants[0]} opened the show with a fiery promo, setting the tone for the night.`;
    case 'backstage-confrontation':
      return `Tensions boiled over backstage as ${participants[0]} and ${participants[1]} had words.`;
    case 'interview':
      return `${participants[0]} was interviewed about their recent performances.`;
    default:
      return `The crowd watched intently.`;
  }
}

function overallReaction(segments: Segment[]): CrowdReaction {
  const reactions = segments
    .map(s => s.matchResult?.crowdReaction)
    .filter(Boolean) as CrowdReaction[];
  if (reactions.length === 0) return 'lukewarm';
  if (reactions.filter(r => r === 'hot').length > reactions.length / 2) return 'hot';
  if (reactions.filter(r => r === 'dead').length > reactions.length / 2) return 'dead';
  return 'lukewarm';
}

function applyPostShowUpdates(wrestlers: Wrestler[], segments: Segment[]): Wrestler[] {
  const updates = new Map<string, Partial<Wrestler['emotionalState']>>();

  for (const seg of segments) {
    if (!seg.matchResult) continue;
    const { winner, participants } = seg.matchResult;
    const loser = participants.find(id => id !== winner);

    const winnerW = wrestlers.find(w => w.wrestlerId === winner);
    if (winnerW) {
      updates.set(winner, {
        confidence: Math.min(10, winnerW.emotionalState.confidence + 1),
        frustration: Math.max(1, winnerW.emotionalState.frustration - 1),
      });
    }

    if (loser) {
      const loserW = wrestlers.find(w => w.wrestlerId === loser);
      if (loserW) {
        updates.set(loser, {
          confidence: Math.max(1, loserW.emotionalState.confidence - 1),
          frustration: Math.min(10, loserW.emotionalState.frustration + 1),
        });
      }
    }
  }

  return wrestlers.map(w => {
    const delta = updates.get(w.wrestlerId);
    if (!delta) return w;
    return { ...w, emotionalState: { ...w.emotionalState, ...delta } };
  });
}

export function generateShow(): Show {
  const state = loadState();
  const wrestlers = loadWrestlers();
  const submissions = loadSubmissions(state.currentWeek);
  const segments: Segment[] = [];

  // 1. Opening promo — highest-charisma wrestler
  const [host] = [...wrestlers].sort((a, b) => b.stats.charisma - a.stats.charisma);
  segments.push({
    segmentId: randomUUID(),
    type: 'opening-promo',
    participants: [host.wrestlerId],
    narration: templateNarration('opening-promo', [host.name]),
  });

  // 2. Build match card — reserve top 2 for main event, pair the rest for mid-card
  const sorted = [...wrestlers].sort(
    (a, b) =>
      (b.stats.strength + b.stats.agility + b.stats.endurance + b.stats.charisma) -
      (a.stats.strength + a.stats.agility + a.stats.endurance + a.stats.charisma)
  );
  const mainEventPair = sorted.splice(0, 2);
  const available = sorted;

  while (available.length >= 2) {
    const [a, b] = available.splice(0, 2);

    const feudRequest = submissions.find(
      s => s.storyRequests.some(r =>
        r.type === 'feud' &&
        (r.target === a.wrestlerId || r.target === b.wrestlerId)
      )
    );

    const result = resolveMatch(a, b, { rivalryHeat: feudRequest ? 7 : 0 });
    segments.push({
      segmentId: randomUUID(),
      type: 'singles-match',
      participants: [a.wrestlerId, b.wrestlerId],
      matchResult: result,
      narration: result.narration,
    });
  }

  // 3. Main event
  const [me_a, me_b] = mainEventPair;
  const mainResult = resolveMatch(me_a, me_b, { rivalryHeat: 5 });
  segments.push({
    segmentId: randomUUID(),
    type: 'main-event',
    participants: [me_a.wrestlerId, me_b.wrestlerId],
    matchResult: mainResult,
    narration: `MAIN EVENT: ${mainResult.narration}`,
  });

  // 4. Post-show state updates
  const updatedWrestlers = applyPostShowUpdates(wrestlers, segments);
  saveWrestlers(updatedWrestlers);

  return {
    showId: randomUUID(),
    week: state.currentWeek,
    segments,
    crowdReaction: overallReaction(segments),
    generatedAt: new Date().toISOString(),
  };
}
