import { generateShow } from './storyteller/showGenerator.js';
import { loadWrestlers, loadState } from './core/gameState.js';
import { transitionTo } from './core/weeklyOrchestrator.js';
import { writeJson } from './data/persistence.js';
import type { Segment } from '@org/wrastlin-shared';

function formatSegment(seg: Segment, wrestlerNames: Map<string, string>): string {
  const names = seg.participants.map(id => wrestlerNames.get(id) ?? id).join(' vs ');
  const lines = [`  [${seg.type.toUpperCase()}] ${names}`];

  if (seg.matchResult) {
    const winner = wrestlerNames.get(seg.matchResult.winner) ?? seg.matchResult.winner;
    lines.push(`    → Winner: ${winner} (${seg.matchResult.finishType})`);
    lines.push(`    → Crowd: ${seg.matchResult.crowdReaction}`);
    lines.push(`    → ${seg.matchResult.narration}`);
  } else {
    lines.push(`    → ${seg.narration}`);
  }

  return lines.join('\n');
}

async function main() {
  const state = loadState();
  if (state.phase !== 'submissions_closed') {
    console.error(`Cannot generate show: phase is '${state.phase}', expected 'submissions_closed'`);
    console.error('Run: curl -X POST http://localhost:3002/state/close-submissions');
    process.exit(1);
  }

  console.log(`\n=== GENERATING SHOW FOR WEEK ${state.currentWeek} ===\n`);

  const show = generateShow();

  const wrestlers = loadWrestlers();
  const nameMap = new Map(wrestlers.map(w => [w.wrestlerId, w.name]));

  console.log(`Show ID: ${show.showId}`);
  console.log(`Week: ${show.week}`);
  console.log(`Overall Crowd: ${show.crowdReaction.toUpperCase()}`);
  console.log('\nSEGMENTS:');
  show.segments.forEach(seg => console.log(formatSegment(seg, nameMap)));

  // Save show (writeJson handles directory creation)
  writeJson(`shows/week-${show.week}.json`, show);
  console.log(`\nShow saved to data/shows/week-${show.week}.json`);

  // Advance state to show_generated
  transitionTo('show_generated');
  console.log(`State advanced to: show_generated`);
  console.log('\nTo start next week: curl -X POST http://localhost:3002/state/advance-week');
}

main().catch(err => { console.error(err); process.exit(1); });
