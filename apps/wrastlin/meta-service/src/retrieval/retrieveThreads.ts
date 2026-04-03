import type { SocialThread, NarrativeEvent, ThreadActorState } from '@org/wrastlin-shared';
import type { RetrievalQuery, RetrievedThread } from './types.js';
import { isThreadRelevant, scoreThread } from './scoreThread.js';

export function retrieveRelevantThreads(
  query: RetrievalQuery,
  allThreads: SocialThread[],
  allEvents: NarrativeEvent[],
): RetrievedThread[] {
  const { wrestlerIds, currentWeek, preferredTags, limit = 5 } = query;
  const querySet = new Set(wrestlerIds);
  const eventMap = new Map(allEvents.map(e => [e.eventId, e]));

  return allThreads
    .filter(thread => isThreadRelevant(thread, wrestlerIds))
    .map(thread => {
      const score = scoreThread(thread, wrestlerIds, currentWeek, preferredTags);

      const relevantActorStates: ThreadActorState[] = thread.actorStates.filter(
        a => querySet.has(a.wrestlerId),
      );

      const linkedEvents: NarrativeEvent[] = thread.eventIds
        .map(id => eventMap.get(id))
        .filter((e): e is NarrativeEvent => e !== undefined)
        .sort((a, b) => b.week - a.week);

      return { thread, score, relevantActorStates, linkedEvents };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
