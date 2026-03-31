export interface NarrativeEvent {
  eventId: string;
  week: number;
  participants: string[];  // wrestlerIds involved
  description: string;     // e.g. "Steel interfered in Rex's title match"
  tags: string[];          // free-form e.g. ['interference', 'title', 'public']
}
