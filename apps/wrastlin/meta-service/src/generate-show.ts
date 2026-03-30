import fs from 'node:fs';
import path from 'node:path';
import { loadWrestlers, loadManagers, loadState, saveState, loadSubmissions, loadAnnouncers } from './core/gameState.js';
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
import { createOpenAIShowOutlineAgent } from './agents/openaiShowOutlineAgent.js';
import type { Wrestler, WeeklySubmission } from '@org/wrastlin-shared';
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
const skipTts = args.includes('--skip-tts');
const force = args.includes('--force');
const resumeIndex = args.indexOf('--resume');
const resumePath = resumeIndex !== -1 ? args[resumeIndex + 1] : undefined;
const scenarioIndex = args.indexOf('--scenario');
const scenarioName = scenarioIndex !== -1 ? args[scenarioIndex + 1] : undefined;

// ── Paths ─────────────────────────────────────────────────────────────────────

const RUNS_DIR = path.resolve(import.meta.dirname, '../data/runs');
const SCENARIOS_DIR = path.resolve(import.meta.dirname, '../data/scenarios/outline');

// ── Scenario loader ───────────────────────────────────────────────────────────

function loadScenario(name: string): { wrestlers: Wrestler[]; submissions: WeeklySubmission[] } {
  const dir = path.join(SCENARIOS_DIR, name);
  if (!fs.existsSync(dir)) {
    console.error(`Scenario not found: ${name}`);
    console.error(`Expected directory: ${dir}`);
    process.exit(1);
  }
  const wrestlers: Wrestler[] = JSON.parse(fs.readFileSync(path.join(dir, 'wrestlers.json'), 'utf-8'));
  const submissionsPath = path.join(dir, 'submissions.json');
  const submissions: WeeklySubmission[] = fs.existsSync(submissionsPath)
    ? JSON.parse(fs.readFileSync(submissionsPath, 'utf-8'))
    : [];
  return { wrestlers, submissions };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRunId(week: number): string {
  const ts = new Date().toISOString().replace(/[^0-9T]/g, '').slice(0, 15);
  return `week-${week}-${ts}`;
}

function formatSegment(seg: GeneratedSegment, nameMap: Map<string, string>): string {
  let names: string;
  if (seg.type === 'match') {
    names = seg.participants.map(team => team.map(id => nameMap.get(id) ?? id).join(' & ')).join(' vs ');
  } else {
    names = seg.participants.map(id => nameMap.get(id) ?? id).join(', ');
  }
  const lines = [`  [${seg.type.toUpperCase()}] ${names}`];
  if (seg.type === 'match') {
    const winner = nameMap.get(seg.beats.result.winner) ?? seg.beats.result.winner;
    lines.push(`    → Winner: ${winner} (${seg.beats.result.finishType})`);
    lines.push(`    → Crowd: ${seg.beats.result.crowdReaction}`);
  }
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let state = loadState();
  if (state.phase !== 'submissions_closed') {
    if (!force) {
      console.error(`Cannot generate show: phase is '${state.phase}', expected 'submissions_closed'`);
      console.error('Run: curl -X POST http://localhost:3002/state/close-submissions');
      console.error('Or use --force to skip the phase check');
      process.exit(1);
    }
    console.warn(`Warning: phase is '${state.phase}', resetting to submissions_closed (--force)`);
    state = { ...state, phase: 'submissions_closed', updatedAt: new Date().toISOString() };
    saveState(state);
  }

  if (!useStub) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OPENAI_API_KEY env var is required when not using --stub');
      process.exit(1);
    }
  }

  const week = state.currentWeek;
  console.log(`\n=== GENERATING SHOW FOR WEEK ${week} ===`);
  console.log(`Mode: ${useStub ? 'stub agents' : 'AI outline + stub beats/screenplays'}`);
  if (scenarioName) console.log(`Scenario: ${scenarioName}`);

  let wrestlers: Wrestler[];
  let submissions: WeeklySubmission[];
  if (scenarioName) {
    ({ wrestlers, submissions } = loadScenario(scenarioName));
  } else {
    wrestlers = loadWrestlers();
    submissions = loadSubmissions(week);
  }
  const managers = loadManagers();
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
      : createOpenAIShowOutlineAgent(process.env.OPENAI_API_KEY!, (prompt) => {
          log.append({
            type: 'prompt_rendered',
            runId: log.runId,
            agentType: 'showOutline',
            segmentId: null,
            prompt,
            timestamp: new Date().toISOString(),
          });
        }),
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

    if (skipTts) {
      console.log('\nTTS skipped (--skip-tts)');
    } else {
      console.log('\nTTS: not yet implemented — run separately with pnpm nx run wrastlin-service:tts-test');
    }

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
