import fs from 'node:fs';
import path from 'node:path';
import { stubAnnouncerScreenplayAgent } from './agents/stubs/stubAnnouncerScreenplayAgent.js';
import type { AnnouncerScreenplayInput } from './agents/types.js';

const SCENARIOS_DIR = path.resolve(import.meta.dirname, '../data/scenarios/announcer');

const args = process.argv.slice(2);
const scenarioIndex = args.indexOf('--scenario');
const scenarioName = scenarioIndex !== -1 ? args[scenarioIndex + 1] : undefined;

if (!scenarioName) {
  console.error('Usage: run-announcer --scenario <name>');
  console.error(`Available scenarios: ${fs.existsSync(SCENARIOS_DIR) ? fs.readdirSync(SCENARIOS_DIR).map(f => f.replace('.json', '')).join(', ') : 'none'}`);
  process.exit(1);
}

const scenarioFile = path.join(SCENARIOS_DIR, `${scenarioName}.json`);
if (!fs.existsSync(scenarioFile)) {
  console.error(`Scenario not found: ${scenarioFile}`);
  process.exit(1);
}

const input: AnnouncerScreenplayInput = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8'));

const announcerNames = input.announcers.map(a => `${a.name} (${a.role})`).join(', ');

console.log(`\n=== ANNOUNCER SCREENPLAY ===`);
console.log(`Segment: ${input.matchBeats.segmentId}`);
console.log(`Announcers: ${announcerNames}`);
console.log(`Beats: ${input.matchBeats.beats.length}`);
console.log('');

const result = await stubAnnouncerScreenplayAgent(input);

console.log('SCREENPLAY:');
console.log('─'.repeat(60));
console.log(result.screenplay);
console.log('─'.repeat(60));
console.log('');
console.log('Full output:');
console.log(JSON.stringify(result, null, 2));
