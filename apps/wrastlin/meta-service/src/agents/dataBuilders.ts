import type {
  Wrestler,
  Manager,
  WeeklySubmission,
  Announcer,
} from '@org/wrastlin-shared';
import type {
  ShowOutline,
  ShowOutlineInput,
  WrestlerSummaryForOutline,
  SubmissionSummaryForOutline,
  MatchOutlineSegment,
  MatchBeatsInput,
  WrestlerForMatchBeats,
  PromoOutlineSegment,
  PromoScreenplayInput,
  ParticipantForPromo,
  TargetForPromo,
  AnnouncerScreenplayInput,
  MatchBeats,
} from './types.js';

export function computeRivalryHeat(
  wrestlers: Wrestler[],
  a: string,
  b: string,
): number {
  const aHatesB = wrestlers
    .find(w => w.wrestlerId === a)
    ?.relationships.find(r => r.wrestlerId === b)?.hatred ?? 0;
  const bHatesA = wrestlers
    .find(w => w.wrestlerId === b)
    ?.relationships.find(r => r.wrestlerId === a)?.hatred ?? 0;
  return Math.round((aHatesB + bHatesA) / 2);
}
