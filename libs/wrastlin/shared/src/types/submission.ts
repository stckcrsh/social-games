export type StoryRequestType = 'push' | 'feud' | 'betrayal' | 'title-shot' | 'promo';

export interface StoryRequest {
  type: StoryRequestType;
  target?: string;       // wrestlerId
  bribeAmount: number;
}

export interface WeeklySubmission {
  submissionId: string;
  managerId: string;
  week: number;
  showRequest: string;         // free-form text sent to the show generator
  bribeAmount: number;         // dollars offered to influence booking
  storyRequests?: StoryRequest[];
  wrestlerMessage?: string;    // optional message to the wrestler
  submittedAt: string;         // ISO timestamp
}
