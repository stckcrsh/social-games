import fs from 'node:fs';
import path from 'node:path';
import { stubPromoScreenplayAgent } from './agents/stubs/stubPromoScreenplayAgent.js';
import type { PromoScreenplayInput } from './agents/types.js';

const SCENARIOS_DIR = path.resolve(import.meta.dirname, '../data/scenarios/promo');

const args = process.argv.slice(2);
const scenarioIndex = args.indexOf('--scenario');
const scenarioName = scenarioIndex !== -1 ? args[scenarioIndex + 1] : undefined;

if (!scenarioName) {
  console.error('Usage: run-promo --scenario <name>');
  console.error(`Available scenarios: ${fs.existsSync(SCENARIOS_DIR) ? fs.readdirSync(SCENARIOS_DIR).map(f => f.replace('.json', '')).join(', ') : 'none'}`);
  process.exit(1);
}

const scenarioFile = path.join(SCENARIOS_DIR, `${scenarioName}.json`);
if (!fs.existsSync(scenarioFile)) {
  console.error(`Scenario not found: ${scenarioFile}`);
  process.exit(1);
}

const input: PromoScreenplayInput = JSON.parse(fs.readFileSync(scenarioFile, 'utf-8'));

const participantNames = input.participants.map(p => p.name).join(', ');
const targetLabel = input.target ? `targeting ${input.target.name}` : 'self-hype';

console.log(`\n=== PROMO SCREENPLAY ===`);
console.log(`Segment: ${input.segment.segmentId}`);
console.log(`Participants: ${participantNames} (${targetLabel})`);
console.log(`Goal: ${input.segment.goal}`);
console.log('');

const result = await stubPromoScreenplayAgent(input);

console.log('SCREENPLAY:');
console.log('─'.repeat(60));
console.log(result.screenplay);
console.log('─'.repeat(60));
console.log('');
console.log('Full output:');
console.log(JSON.stringify(result, null, 2));
