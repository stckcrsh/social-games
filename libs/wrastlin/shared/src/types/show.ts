export type FinishType =
  | 'clean'
  | 'dirty'
  | 'interference'
  | 'count-out'
  | 'dq'
  | 'no-contest';

export type CrowdReaction = 'hot' | 'lukewarm' | 'dead';

export type SegmentType =
  | 'opening-promo'
  | 'singles-match'
  | 'backstage-confrontation'
  | 'interview'
  | 'betrayal'
  | 'title-match'
  | 'main-event';

export interface MatchResult {
  matchId: string;
  participants: string[];       // wrestlerIds
  winner: string;               // wrestlerId
  finishType: FinishType;
  crowdReaction: CrowdReaction;
  moments: string[];            // narrative beat strings
  narration: string;
}

export interface Segment {
  segmentId: string;
  type: SegmentType;
  participants: string[];
  matchResult?: MatchResult;
  narration: string;
}

export interface Show {
  showId: string;
  week: number;
  segments: Segment[];
  crowdReaction: CrowdReaction;
  generatedAt: string; // ISO timestamp
}
