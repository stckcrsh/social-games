import type { Wrestler, Manager, WeeklySubmission, Announcer } from '@org/wrastlin-shared';
import type {
  ShowOutlineInput,
  ShowOutlineAgentFn,
  MatchBeatsAgentFn,
  PromoScreenplayAgentFn,
  AnnouncerScreenplayAgentFn,
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
} from './dataBuilders.js';

interface PipelineParams {
  showOutlineInput: ShowOutlineInput;
  wrestlers: Wrestler[];
  managers: Manager[];
  submissions: WeeklySubmission[];
  announcers: Announcer[];
  agents: {
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
  const { showOutlineInput, wrestlers, managers, submissions, announcers, agents } = params;

  // Step 1: Generate show outline
  const showOutline = await agents.showOutline(showOutlineInput);

  // Step 2: Process all segments in parallel
  //   - matches → get beats
  //   - promos  → get screenplay
  const segmentResults: SegmentResult[] = await Promise.all(
    showOutline.segments.map(async (segment): Promise<SegmentResult> => {
      if (segment.type === 'match') {
        const input = buildMatchBeatsInput(segment, wrestlers, managers, submissions);
        const beats = await agents.matchBeats(input);
        return { type: 'match', segment, beats };
      } else {
        const input = buildPromoScreenplayInput(
          segment,
          wrestlers,
          showOutlineInput.week,
          announcers,
        );
        const promoScreenplay = await agents.promoScreenplay(input);
        return { type: 'promo', segment, promoScreenplay };
      }
    }),
  );

  // Step 3: Run announcer screenplays for all match segments in parallel
  const generatedSegments: GeneratedSegment[] = await Promise.all(
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

  // Sort by order field to match the show card
  generatedSegments.sort((a, b) => a.order - b.order);

  return { showOutline, segments: generatedSegments };
}
