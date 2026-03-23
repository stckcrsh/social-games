import fs from 'node:fs';
import path from 'node:path';
import { loadWrestlers, loadManagers, loadState, loadSubmissions, loadAnnouncers } from './core/gameState.js';
import { transitionTo } from './core/weeklyOrchestrator.js';
import { writeDynamicJson as writeJson } from './data/persistence.js';
import { buildShowOutlineInput } from './agents/dataBuilders.js';
import { runShowPipeline, PartialRunError } from './agents/pipeline.js';
import { RunLog } from './agents/runLog.js';
import { OutboxRunner } from './agents/outboxRunner.js';
import { stubShowOutlineAgent } from './agents/stubs/stubShowOutlineAgent.js';
import { stubMatchBeatsAgent } from './agents/stubs/stubMatchBeatsAgent.js';
import { stubPromoScreenplayAgent } from './agents/stubs/stubPromoScreenplayAgent.js';
import { stubAnnouncerScreenplayAgent } from './agents/stubs/stubAnnouncerScreenplayAgent.js';
import { createClaudeShowOutlineAgent } from './agents/claudeShowOutlineAgent.js';
import type {
  GeneratedSegment,
  GeneratedMatchSegment,
  MatchBeatsInput,
  PromoScreenplayInput,
  AnnouncerScreenplayInput,
} from './agents/types.js';

// ── CLI args ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const useStub = args.includes('--stub');
const resumeIndex = args.indexOf('--resume');
const resumePath = resumeIndex !== -1 ? args[resumeIndex + 1] : undefined;

// ── Paths ─────────────────────────────────────────────────────────────────────

const RUNS_DIR = path.resolve(import.meta.dirname, '../data/runs');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRunId(week: number): string {
  const ts = new Date().toISOString().replace(/[^0-9T]/g, '').slice(0, 15);
  return `week-${week}-${ts}`;
}

function formatSegment(seg: GeneratedSegment, nameMap: Map<string, string>): string {
  const names = seg.participants.map(id => nameMap.get(id) ?? id).join(' vs ');
  const lines = [`  [${seg.type.toUpperCase()}] ${names}`];
  if (seg.type === 'match') {
    const matchSeg = seg as GeneratedMatchSegment;
    const winner = nameMap.get(matchSeg.beats.result.winner) ?? matchSeg.beats.result.winner;
    lines.push(`    → Winner: ${winner} (${matchSeg.beats.result.finishType})`);
    lines.push(`    → Crowd: ${matchSeg.beats.result.crowdReaction}`);
  }
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const state = loadState();
  if (state.phase !== 'submissions_closed') {
    console.error(`Cannot generate show: phase is '${state.phase}', expected 'submissions_closed'`);
    console.error('Run: curl -X POST http://localhost:3002/state/close-submissions');
    process.exit(1);
  }

  if (!useStub) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY env var is required when not using --stub');
      process.exit(1);
    }
  }

  const week = state.currentWeek;
  console.log(`\n=== GENERATING SHOW FOR WEEK ${week} ===`);
  console.log(`Mode: ${useStub ? 'stub agents' : 'AI outline + stub beats/screenplays'}`);

  const wrestlers = loadWrestlers();
  const managers = loadManagers();
  const submissions = loadSubmissions(week);
  const announcers = loadAnnouncers();

  // Set up run log
  let log: RunLog;
  if (resumePath) {
    const absResumePath = path.resolve(resumePath);
    if (!fs.existsSync(absResumePath)) {
      console.error(`Resume file not found: ${absResumePath}`);
      process.exit(1);
    }
    log = new RunLog(absResumePath);
    console.log(`\nResuming run: ${log.runId}`);
  } else {
    const runId = makeRunId(week);
    fs.mkdirSync(RUNS_DIR, { recursive: true });
    log = new RunLog(path.join(RUNS_DIR, `${runId}.jsonl`));
    log.append({
      type: 'run_started',
      runId: log.runId,
      week,
      mode: useStub ? 'stub' : 'ai',
      timestamp: new Date().toISOString(),
    });
    console.log(`\nRun log: data/runs/${log.runId}.jsonl`);
  }

  const runner = new OutboxRunner(log);

  const baseAgents = {
    showOutline: useStub
      ? stubShowOutlineAgent
      : createClaudeShowOutlineAgent(process.env.ANTHROPIC_API_KEY!),
    matchBeats: stubMatchBeatsAgent,
    promoScreenplay: stubPromoScreenplayAgent,
    announcerScreenplay: stubAnnouncerScreenplayAgent,
  };

  // Per-segment agents extract segmentId from their input at call time
  const agents = {
    showOutline: runner.wrap('showOutline', null, baseAgents.showOutline),
    matchBeats: (input: MatchBeatsInput) =>
      runner.wrap('matchBeats', input.segment.segmentId, baseAgents.matchBeats)(input),
    promoScreenplay: (input: PromoScreenplayInput) =>
      runner.wrap('promoScreenplay', input.segment.segmentId, baseAgents.promoScreenplay)(input),
    announcerScreenplay: (input: AnnouncerScreenplayInput) =>
      runner.wrap('announcerScreenplay', input.matchBeats.segmentId, baseAgents.announcerScreenplay)(input),
  };

  const showOutlineInput = buildShowOutlineInput(week, wrestlers, managers, submissions, []);

  try {
    const show = await runShowPipeline({
      showOutlineInput,
      wrestlers,
      managers,
      submissions,
      announcers,
      agents,
    });

    writeJson(`shows/week-${week}.json`, show);
    transitionTo('show_generated');

    log.append({
      type: 'run_completed',
      runId: log.runId,
      showId: show.showOutline.showId,
      timestamp: new Date().toISOString(),
    });

    const nameMap = new Map(wrestlers.map(w => [w.wrestlerId, w.name]));
    console.log(`\nShow ID: ${show.showOutline.showId}`);
    console.log(`Week: ${show.showOutline.week}`);
    console.log('\nSEGMENTS:');
    show.segments.forEach(seg => console.log(formatSegment(seg, nameMap)));
    console.log(`\nShow saved to data/shows/week-${week}.json`);
    console.log(`State advanced to: show_generated`);
    console.log('\nTo start next week: curl -X POST http://localhost:3002/state/advance-week');

  } catch (err) {
    if (err instanceof PartialRunError) {
      log.append({
        type: 'run_failed',
        runId: log.runId,
        failedSegments: err.failedSegmentIds,
        timestamp: new Date().toISOString(),
      });
      console.error(`\nRun failed. Failed segments: ${err.failedSegmentIds.join(', ')}`);
      console.error(`\nTo resume: pnpm nx run wrastlin-service:generate-show -- --stub --resume data/runs/${log.runId}.jsonl`);
    } else {
      log.append({
        type: 'run_failed',
        runId: log.runId,
        failedSegments: ['showOutline'],
        timestamp: new Date().toISOString(),
      });
      console.error('\nRun failed unexpectedly:', err instanceof Error ? err.message : String(err));
      console.error(`\nTo resume: pnpm nx run wrastlin-service:generate-show -- --stub --resume data/runs/${log.runId}.jsonl`);
    }
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
