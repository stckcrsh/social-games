// src/retrieval/types.ts
import type { SocialThread, ThreadActorState, NarrativeEvent } from '@org/wrastlin-shared';

export interface RetrievalQuery {
  wrestlerIds: string[];       // wrestlers we need context for (e.g. "Rex's promo" → ['w-001'])
  currentWeek: number;         // used to compute recency score
  preferredTags?: string[];    // optional: threads with these tags get a scoring bonus
  limit?: number;              // max results to return; default 5
}

export interface RetrievedThread {
  thread: SocialThread;
  score: number;
  relevantActorStates: ThreadActorState[];  // actorStates for the query wrestlers only
  linkedEvents: NarrativeEvent[];           // events attached to this thread, most recent first
}
