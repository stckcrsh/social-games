import fs from 'node:fs';
import path from 'node:path';
import { stubMatchBeatsAgent } from './agents/stubs/stubMatchBeatsAgent.js';
import type { MatchBeatsInput } from './agents/types.js';

const SCENARIOS_DIR = path.resolve(import.meta.dirname, '../data/scenarios/beats');

const args = process.argv.slice(2);
const scenarioIndex = args.indexOf('--scenario');
const scenarioName = scenarioIndex !== -1 ? args[scenarioIndex + 1] : undefined;

if (!scenarioName) {
  console.error('Usage: run-beats --scenario <name>');
  console.error(`Available scenarios: ${fs.existsSync(SCENARIOS_DIR) ? fs.readdirSync(SCENARIOS_DIR).map(f => f.replace('.json', '')).join(', ') : 'none'}`);
  process.exit(1);
}

const scenarioFile = path.join(SCENARIOS_DIR, `${scenarioName}.json`);
if (!fs.existsSync(scenarioFile)) {
  console.error(`Scenario not found: ${scenarioFile}`);
  process.exit(1);
}

const input: MatchBeatsInput = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8'));

console.log(`\n=== MATCH BEATS: ${input.segment.matchType?.toUpperCase()} ===`);
console.log(`Segment: ${input.segment.segmentId}`);
console.log(`Participants: ${input.wrestlers.map(w => w.name).join(' vs ')}`);
console.log(`Headliner: ${input.segment.headliner}`);
console.log('');

const result = await stubMatchBeatsAgent(input);

console.log('BEATS:');
for (const beat of result.beats) {
  const actor = beat.actor ?? 'crowd';
  if (beat.type === 'pause') {
    console.log(`  [PAUSE ${beat.durationMs}ms] ${beat.description}`);
  } else {
    console.log(`  [${beat.type.toUpperCase()}] ${actor}: ${beat.description}`);
  }
}
console.log('');
console.log(`Result: ${result.result.winner} wins via ${result.result.finishType} — crowd: ${result.result.crowdReaction}`);
console.log('');
console.log('Full output:');
console.log(JSON.stringify(result, null, 2));
