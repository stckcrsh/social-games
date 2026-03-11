export type MatchStyle = 'technical' | 'brawl' | 'high-fly' | 'heel' | 'face';
export type StoryRequestType = 'push' | 'feud' | 'betrayal' | 'title-shot' | 'promo';

export interface ManagerAdvice {
  matchStyle: MatchStyle;
  targetOpponent?: string; // wrestlerId
}

export interface StoryRequest {
  type: StoryRequestType;
  target?: string; // wrestlerId
  bribeAmount: number;
}

export interface WeeklySubmission {
  submissionId: string;
  managerId: string;
  week: number;
  advice: ManagerAdvice;
  storyRequests: StoryRequest[];
  wrestlerMessage?: string; // optional message/letter to the wrestler
  submittedAt: string; // ISO timestamp
}
