import type { Wrestler, Manager, WeeklySubmission, Announcer, SocialThread } from '@org/wrastlin-shared';
import type {
  ShowOutlineInput,
  ShowOutlineAgentFn,
  MatchBeatsAgentFn,
  PromoScreenplayAgentFn,
  AnnouncerScreenplayAgentFn,
  WrestlerThoughtProcessAgentFn,
  WrestlerThoughtProcessOutput,
  GeneratedShow,
  GeneratedSegment,
  MatchOutlineSegment,
  PromoOutlineSegment,
  MatchBeats,
  PromoScreenplay,
} from './types.js';
import {
  buildMatchBeatsInput,
  buildPromoScreenplayInput,
  buildAnnouncerScreenplayInput,
  buildWrestlerThoughtProcessInput,
} from './dataBuilders.js';

export class PartialRunError extends Error {
  constructor(public readonly failedSegmentIds: string[]) {
    super(`Pipeline failed for segments: ${failedSegmentIds.join(', ')}`);
  }
}

interface PipelineParams {
  showOutlineInput: ShowOutlineInput;
  wrestlers: Wrestler[];
  managers: Manager[];
  submissions: WeeklySubmission[];
  announcers: Announcer[];
  threads: SocialThread[];
  agents: {
    wrestlerThoughtProcess: WrestlerThoughtProcessAgentFn;
    showOutline: ShowOutlineAgentFn;
    matchBeats: MatchBeatsAgentFn;
    promoScreenplay: PromoScreenplayAgentFn;
    announcerScreenplay: AnnouncerScreenplayAgentFn;
  };
}

// Intermediate types carry narrowed segment so no `as` casts are needed downstream
type MatchResult = { type: 'match'; segment: MatchOutlineSegment; beats: MatchBeats };
type PromoResult = { type: 'promo'; segment: PromoOutlineSegment; promoScreenplay: PromoScreenplay };
type SegmentResult = MatchResult | PromoResult;

export async function runShowPipeline(params: PipelineParams): Promise<GeneratedShow> {
  const { showOutlineInput, wrestlers, managers, submissions, announcers, threads, agents } = params;

  // Step 0: Wrestler thought process (parallel per wrestler — runs before outline)
  const step0Settled = await Promise.allSettled(
    wrestlers.map(async (wrestler): Promise<WrestlerThoughtProcessOutput> => {
      const submission = submissions.find(s => {
        const manager = managers.find(m => m.managerId === s.managerId);
        return manager?.wrestlerId === wrestler.wrestlerId;
      });
      const input = buildWrestlerThoughtProcessInput(wrestler, submission, threads);
      return agents.wrestlerThoughtProcess(input);
    }),
  );

  const step0Failed: string[] = [];
  const wrestlerThoughtProcess: WrestlerThoughtProcessOutput[] = [];
  for (let i = 0; i < step0Settled.length; i++) {
    const result = step0Settled[i];
    if (result.status === 'fulfilled') {
      wrestlerThoughtProcess.push(result.value);
    } else {
      step0Failed.push(wrestlers[i].wrestlerId);
    }
  }
  if (step0Failed.length > 0) throw new PartialRunError(step0Failed);

  // Step 1: Generate show outline (sequential — defines the segment list)
  const showOutline = await agents.showOutline({
    ...showOutlineInput,
    wrestlerThoughtProcess,
  });

  // Step 2: Process all segments in parallel — matches get beats, promos get screenplay
  const step2Settled = await Promise.allSettled(
    showOutline.segments.map(async (segment): Promise<SegmentResult> => {
      if (segment.type === 'match') {
        const input = buildMatchBeatsInput(segment, wrestlers);
        const beats = await agents.matchBeats(input);
        return { type: 'match', segment, beats };
      } else {
        const input = buildPromoScreenplayInput(
          segment,
          wrestlers,
          announcers,
        );
        const promoScreenplay = await agents.promoScreenplay(input);
        return { type: 'promo', segment, promoScreenplay };
      }
    }),
  );

  const step2Failed: string[] = [];
  const segmentResults: SegmentResult[] = [];
  for (let i = 0; i < step2Settled.length; i++) {
    const result = step2Settled[i];
    if (result.status === 'fulfilled') {
      segmentResults.push(result.value);
    } else {
      step2Failed.push(showOutline.segments[i].segmentId);
    }
  }
  if (step2Failed.length > 0) throw new PartialRunError(step2Failed);

  // Step 3: Run announcer screenplays for match segments in parallel; promos pass through
  const step3Settled = await Promise.allSettled(
    segmentResults.map(async (result): Promise<GeneratedSegment> => {
      if (result.type === 'match') {
        const input = buildAnnouncerScreenplayInput(result.beats, announcers);
        const announcerScreenplay = await agents.announcerScreenplay(input);
        return { ...result.segment, beats: result.beats, announcerScreenplay };
      } else {
        return { ...result.segment, promoScreenplay: result.promoScreenplay };
      }
    }),
  );

  const step3Failed: string[] = [];
  const generatedSegments: GeneratedSegment[] = [];
  for (let i = 0; i < step3Settled.length; i++) {
    const result = step3Settled[i];
    if (result.status === 'fulfilled') {
      generatedSegments.push(result.value);
    } else {
      step3Failed.push(segmentResults[i].segment.segmentId);
    }
  }
  if (step3Failed.length > 0) throw new PartialRunError(step3Failed);

  // Sort by order field to match the show card
  generatedSegments.sort((a, b) => a.order - b.order);

  return { showOutline, segments: generatedSegments, wrestlerThoughtProcess };
}
