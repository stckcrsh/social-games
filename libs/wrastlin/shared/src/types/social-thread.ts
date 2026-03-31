export interface ThreadActorState {
  wrestlerId: string;
  care: number;    // 1–10; how much this thread is on their mind; decays over time
  stance: string;  // free-form e.g. 'aggrieved', 'dismissive', 'motivated', 'grateful'
  summary: string; // prose: wrestler's current interpretation e.g. "Rex sees this as unfinished business"
}

export interface SocialThread {
  threadId: string;
  title: string;                    // human-readable e.g. "Rex vs Steel Conflict"; set at creation
  subjects: string[];               // wrestlerIds — main wrestlers involved
  tags: string[];                   // free-form e.g. ['conflict', 'betrayal', 'title']
  createdWeek: number;
  lastUpdatedWeek: number;
  eventIds: string[];               // references to NarrativeEvent.eventId
  actorStates: ThreadActorState[];  // one entry per involved wrestler; care is per-wrestler
}
