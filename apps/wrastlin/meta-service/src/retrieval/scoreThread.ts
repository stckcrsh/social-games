import type { SocialThread } from '@org/wrastlin-shared';

export function isThreadRelevant(thread: SocialThread, wrestlerIds: string[]): boolean {
  const querySet = new Set(wrestlerIds);
  return (
    thread.subjects.some(id => querySet.has(id)) ||
    thread.actorStates.some(a => querySet.has(a.wrestlerId))
  );
}

export function scoreThread(
  thread: SocialThread,
  wrestlerIds: string[],
  currentWeek: number,
  preferredTags?: string[],
): number {
  const querySet = new Set(wrestlerIds);

  const subjectMatchBonus = thread.subjects.some(id => querySet.has(id)) ? 5 : 0;

  const relevantCares = thread.actorStates
    .filter(a => querySet.has(a.wrestlerId))
    .map(a => a.care);
  const careScore = relevantCares.length > 0 ? Math.max(...relevantCares) : 0;

  const recencyScore = Math.max(0, 10 - (currentWeek - thread.lastUpdatedWeek));

  const tagScore = preferredTags
    ? Math.min(5, preferredTags.filter(t => thread.tags.includes(t)).length)
    : 0;

  return subjectMatchBonus + careScore + recencyScore + tagScore;
}
