import fs from 'node:fs';
import path from 'node:path';
import { loadManagers } from './core/gameState.js';
import { buildShowOutlineInput } from './agents/dataBuilders.js';
import { stubShowOutlineAgent } from './agents/stubs/stubShowOutlineAgent.js';
import { createOpenAIShowOutlineAgent } from './agents/openaiShowOutlineAgent.js';
import type { Wrestler, WeeklySubmission, Manager } from '@org/wrastlin-shared';

const SCENARIOS_DIR = path.resolve(import.meta.dirname, '../data/scenarios/outline');

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const useStub = args.includes('--stub');
const printPrompt = args.includes('--print-prompt');
const scenarioIndex = args.indexOf('--scenario');
const scenarioName = scenarioIndex !== -1 ? args[scenarioIndex + 1] : undefined;

if (!scenarioName) {
  console.error('Usage: run-outline --scenario <name> [--stub] [--print-prompt]');
  const available = fs.existsSync(SCENARIOS_DIR)
    ? fs.readdirSync(SCENARIOS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .join(', ')
    : 'none';
  console.error(`Available scenarios: ${available}`);
  process.exit(1);
}

if (!useStub) {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY env var is required when not using --stub');
    process.exit(1);
  }
}

// ── Load scenario ─────────────────────────────────────────────────────────────

const scenarioDir = path.join(SCENARIOS_DIR, scenarioName);
if (!fs.existsSync(scenarioDir)) {
  console.error(`Scenario not found: ${scenarioDir}`);
  process.exit(1);
}

const wrestlers: Wrestler[] = JSON.parse(
  fs.readFileSync(path.join(scenarioDir, 'wrestlers.json'), 'utf-8'),
);
const submissionsPath = path.join(scenarioDir, 'submissions.json');
const submissions: WeeklySubmission[] = fs.existsSync(submissionsPath)
  ? JSON.parse(fs.readFileSync(submissionsPath, 'utf-8'))
  : [];

const managersPath = path.join(scenarioDir, 'managers.json');
const managers: Manager[] = fs.existsSync(managersPath)
  ? JSON.parse(fs.readFileSync(managersPath, 'utf-8'))
  : loadManagers();

// ── Build input ───────────────────────────────────────────────────────────────

const input = buildShowOutlineInput(1, wrestlers, managers, submissions, [], []);

// ── Run agent ─────────────────────────────────────────────────────────────────

console.log(`\n=== SHOW OUTLINE: ${scenarioName} ===`);
console.log(`Mode: ${useStub ? 'stub' : 'OpenAI'}`);
console.log(`Wrestlers: ${wrestlers.map(w => w.name).join(', ')}`);
console.log(`Submissions: ${submissions.length}`);
console.log('');

let renderedPrompt: string | null = null;

const agent = useStub
  ? stubShowOutlineAgent
  : createOpenAIShowOutlineAgent(process.env.OPENAI_API_KEY!, (prompt) => {
      renderedPrompt = prompt;
    });

const result = await agent(input);

// ── Output ────────────────────────────────────────────────────────────────────

if (printPrompt && renderedPrompt) {
  console.log('PROMPT SENT TO MODEL:');
  console.log('─'.repeat(60));
  console.log(renderedPrompt);
  console.log('─'.repeat(60));
  console.log('');
}

console.log('SEGMENTS:');
for (const seg of result.segments) {
  if (seg.type === 'match') {
    const names = seg.participants.map(team => team.join(' & ')).join(' vs ');
    const headliner = seg.headliner ? ' ★' : '';
    console.log(`  [MATCH${headliner}] ${seg.matchType?.toUpperCase()} — ${names}`);
    if (seg.interference.length > 0) {
      console.log(`    interference: ${seg.interference.join(', ')}`);
    }
  } else {
    const names = seg.participants.join(', ');
    const target = seg.target ? ` → targets ${seg.target}` : ' (self-hype)';
    console.log(`  [PROMO] ${names}${target}`);
    console.log(`    goal: ${seg.goal}`);
  }
}

console.log('');
console.log('Full output:');
console.log(JSON.stringify(result, null, 2));
