import type {
  WrestlerStats,
  WrestlerPersonality,
  WrestlerEmotions,
  Announcer,
} from '@org/wrastlin-shared';

// ── Show Outline (Agent 1 output) ────────────────────────────────────────────

export interface PromoOutlineSegment {
  segmentId: string;
  order: number;
  type: 'promo';
  participants: string[];   // wrestlerIds
  target?: string;          // wrestlerId this promo is directed at (absent = self-hype)
  goal: string;             // one sentence
}

export interface MatchOutlineSegment {
  segmentId: string;
  order: number;
  type: 'match';
  matchType: string;          // 'singles' | 'tag-team' | 'cage' | 'ladder' | ...
  participants: string[][];   // teams of wrestlerIds: [[w1, w2], [w3, w4]] or [[w1], [w2]] for singles
  interference: string[];     // wrestlerIds who interfere (empty if none)
  headliner: boolean;
}

export type OutlineSegment = PromoOutlineSegment | MatchOutlineSegment;

export interface ShowOutline {
  showId: string;
  week: number;
  segments: OutlineSegment[];
}

// ── Match Beats (Agent 2 output) ─────────────────────────────────────────────

export type BeatType = 'action' | 'pause' | 'near-finish' | 'interference' | 'finish';

export interface MatchBeat {
  order: number;
  type: BeatType;
  actor: string | null;     // wrestlerId; null for pause beats
  description: string;
  durationMs: number;       // only meaningful on 'pause' beats; 0 otherwise
}

export interface MatchBeats {
  segmentId: string;
  beats: MatchBeat[];
  result: {
    winner: string;
    finishType: 'clean' | 'dirty' | 'interference' | 'count-out' | 'dq' | 'no-contest';
    crowdReaction: 'hot' | 'lukewarm' | 'dead';
  };
}

// ── Screenplays (Agents 3 and 4 output) ──────────────────────────────────────

export interface ScreenplayActor {
  name: string;
  role: string;
}

export interface PromoScreenplay {
  segmentId: string;
  actors: ScreenplayActor[];
  screenplay: string;   // raw text: "[NAME]: line\n[NAME]: line\n..."
}

export interface AnnouncerScreenplay {
  segmentId: string;
  actors: ScreenplayActor[];
  screenplay: string;   // raw text including [PAUSE: N] lines
}

// ── Pipeline output ───────────────────────────────────────────────────────────

export interface GeneratedMatchSegment extends MatchOutlineSegment {
  beats: MatchBeats;
  announcerScreenplay: AnnouncerScreenplay;
}

export interface GeneratedPromoSegment extends PromoOutlineSegment {
  promoScreenplay: PromoScreenplay;
}

export type GeneratedSegment = GeneratedMatchSegment | GeneratedPromoSegment;

export interface GeneratedShow {
  showOutline: ShowOutline;
  segments: GeneratedSegment[];
}

// ── Input payload types (what gets injected into prompt templates) ────────────

export interface WrestlerSummaryForOutline {
  wrestlerId: string;
  name: string;
  gimmick: string;
  emotionalState: WrestlerEmotions;
}

export interface SubmissionSummaryForOutline {
  managerId: string;
  wrestlerId: string;    // joined from Manager.wrestlerId
  showRequest: string;
  bribeAmount: number;
}

export interface ShowOutlineInput {
  week: number;
  previousOutlines: ShowOutline[];
  wrestlers: WrestlerSummaryForOutline[];
  submissions: SubmissionSummaryForOutline[];
}

export interface WrestlerForMatchBeats {
  wrestlerId: string;
  name: string;
  gimmick: string;
  stats: WrestlerStats;
  personality: WrestlerPersonality;
  emotionalState: WrestlerEmotions;
  finisher: string;
}

export interface MatchBeatsInput {
  segment: MatchOutlineSegment;
  wrestlers: WrestlerForMatchBeats[];
}

export interface ParticipantForPromo {
  wrestlerId: string;
  name: string;
  gimmick: string;
  personality: WrestlerPersonality;
  emotionalState: WrestlerEmotions;
}

export interface TargetForPromo {
  wrestlerId: string;
  name: string;
  gimmick: string;
  personality: WrestlerPersonality;
}

export interface PromoScreenplayInput {
  segment: PromoOutlineSegment;
  participants: ParticipantForPromo[];
  target: TargetForPromo | null;
  personas: Announcer[];
}

export interface AnnouncerScreenplayInput {
  matchBeats: MatchBeats;
  announcers: Announcer[];
}

// ── Agent function interfaces ─────────────────────────────────────────────────

export type ShowOutlineAgentFn = (input: ShowOutlineInput) => Promise<ShowOutline>;
export type MatchBeatsAgentFn = (input: MatchBeatsInput) => Promise<MatchBeats>;
export type PromoScreenplayAgentFn = (input: PromoScreenplayInput) => Promise<PromoScreenplay>;
export type AnnouncerScreenplayAgentFn = (input: AnnouncerScreenplayInput) => Promise<AnnouncerScreenplay>;
