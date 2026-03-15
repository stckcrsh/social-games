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

export function buildShowOutlineInput(
  week: number,
  wrestlers: Wrestler[],
  managers: Manager[],
  submissions: WeeklySubmission[],
  previousOutlines: ShowOutline[],
): ShowOutlineInput {
  const wrestlerSummaries: WrestlerSummaryForOutline[] = wrestlers.map(w => {
    const rivalryHeat: Record<string, number> = {};
    for (const other of wrestlers) {
      if (other.wrestlerId !== w.wrestlerId) {
        rivalryHeat[other.wrestlerId] = computeRivalryHeat(wrestlers, w.wrestlerId, other.wrestlerId);
      }
    }
    return {
      wrestlerId: w.wrestlerId,
      name: w.name,
      gimmick: w.gimmick,
      emotionalState: w.emotionalState,
      rivalryHeat,
    };
  });

  const submissionSummaries: SubmissionSummaryForOutline[] = submissions
    .map(sub => {
      const manager = managers.find(m => m.managerId === sub.managerId);
      if (!manager) return null;
      return {
        managerId: sub.managerId,
        wrestlerId: manager.wrestlerId,
        advice: {
          matchStyle: sub.advice.matchStyle,
          targetOpponent: sub.advice.targetOpponent,
        },
        storyRequests: sub.storyRequests.map(sr => ({
          type: sr.type,
          target: sr.target,
          bribeAmount: sr.bribeAmount,
        })),
      };
    })
    .filter((s): s is SubmissionSummaryForOutline => s !== null);

  return { week, previousOutlines, wrestlers: wrestlerSummaries, submissions: submissionSummaries };
}

export function buildMatchBeatsInput(
  segment: MatchOutlineSegment,
  allWrestlers: Wrestler[],
  allManagers: Manager[],
  submissions: WeeklySubmission[],
): MatchBeatsInput {
  const relevantIds = new Set([...segment.participants, ...segment.interference]);
  const wrestlers: WrestlerForMatchBeats[] = allWrestlers
    .filter(w => relevantIds.has(w.wrestlerId))
    .map(w => {
      const manager = allManagers.find(m => m.wrestlerId === w.wrestlerId);
      const submission = manager
        ? submissions.find(s => s.managerId === manager.managerId)
        : undefined;
      const entry: WrestlerForMatchBeats = {
        wrestlerId: w.wrestlerId,
        name: w.name,
        gimmick: w.gimmick,
        stats: w.stats,
        personality: w.personality,
        emotionalState: w.emotionalState,
        finisher: w.finisher,
      };
      if (submission?.advice.matchStyle) {
        entry.matchStyle = submission.advice.matchStyle;
      }
      return entry;
    });
  return { segment, wrestlers };
}

export function buildPromoScreenplayInput(
  segment: PromoOutlineSegment,
  allWrestlers: Wrestler[],
  currentWeek: number,
  personas: Announcer[],
): PromoScreenplayInput {
  const minWeek = currentWeek - 2;

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
        memories: w.memories.filter(m => m.week >= minWeek),
      };
    })
    .filter((p): p is ParticipantForPromo => p !== null);

  let target: TargetForPromo | null = null;
  if (segment.target) {
    const targetWrestler = allWrestlers.find(w => w.wrestlerId === segment.target);
    if (targetWrestler) {
      const participantIds = new Set(segment.participants);
      const sharedMemories = targetWrestler.memories.filter(
        m => participantIds.has(m.source) || participantIds.has(m.target),
      );
      target = {
        wrestlerId: targetWrestler.wrestlerId,
        name: targetWrestler.name,
        gimmick: targetWrestler.gimmick,
        personality: targetWrestler.personality,
        sharedMemories,
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
