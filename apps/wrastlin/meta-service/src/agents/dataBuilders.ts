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

export function buildShowOutlineInput(
  week: number,
  wrestlers: Wrestler[],
  managers: Manager[],
  submissions: WeeklySubmission[],
  previousOutlines: ShowOutline[],
): ShowOutlineInput {
  const wrestlerSummaries: WrestlerSummaryForOutline[] = wrestlers.map(w => ({
    wrestlerId: w.wrestlerId,
    name: w.name,
    gimmick: w.gimmick,
    emotionalState: w.emotionalState,
  }));

  const submissionSummaries: SubmissionSummaryForOutline[] = submissions
    .map(sub => {
      const manager = managers.find(m => m.managerId === sub.managerId);
      if (!manager) return null;
      return {
        managerId: sub.managerId,
        wrestlerId: manager.wrestlerId,
        showRequest: sub.showRequest,
        bribeAmount: sub.bribeAmount,
      };
    })
    .filter((s): s is SubmissionSummaryForOutline => s !== null);

  return { week, previousOutlines, wrestlers: wrestlerSummaries, submissions: submissionSummaries };
}

export function buildMatchBeatsInput(
  segment: MatchOutlineSegment,
  allWrestlers: Wrestler[],
): MatchBeatsInput {
  const relevantIds = new Set([...segment.participants.flat(), ...segment.interference]);
  const wrestlers: WrestlerForMatchBeats[] = allWrestlers
    .filter(w => relevantIds.has(w.wrestlerId))
    .map(w => {
      return {
        wrestlerId: w.wrestlerId,
        name: w.name,
        gimmick: w.gimmick,
        stats: w.stats,
        personality: w.personality,
        emotionalState: w.emotionalState,
        finisher: w.finisher,
      };
    });
  return { segment, wrestlers };
}

export function buildPromoScreenplayInput(
  segment: PromoOutlineSegment,
  allWrestlers: Wrestler[],
  personas: Announcer[],
): PromoScreenplayInput {
  const participants: ParticipantForPromo[] = segment.participants
    .map(id => {
      const w = allWrestlers.find(wr => wr.wrestlerId === id);
      if (!w) return null;
      return {
        wrestlerId: w.wrestlerId,
        name: w.name,
        gimmick: w.gimmick,
        personality: w.personality,
        emotionalState: w.emotionalState,
      };
    })
    .filter((p): p is ParticipantForPromo => p !== null);

  let target: TargetForPromo | null = null;
  if (segment.target) {
    const targetWrestler = allWrestlers.find(w => w.wrestlerId === segment.target);
    if (targetWrestler) {
      target = {
        wrestlerId: targetWrestler.wrestlerId,
        name: targetWrestler.name,
        gimmick: targetWrestler.gimmick,
        personality: targetWrestler.personality,
      };
    }
  }

  return { segment, participants, target, personas };
}

export function buildAnnouncerScreenplayInput(
  matchBeats: MatchBeats,
  announcers: Announcer[],
): AnnouncerScreenplayInput {
  return { matchBeats, announcers };
}
