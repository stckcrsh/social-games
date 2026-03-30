import fs from 'node:fs';
import path from 'node:path';

const RUNS_DIR = path.resolve(import.meta.dirname, '../data/runs');

// ── Args ──────────────────────────────────────────────────────────────────────

const [, , runArg] = process.argv;

// ── Find run file ─────────────────────────────────────────────────────────────

function latestRunFile(): string {
  const files = fs.readdirSync(RUNS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(RUNS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  if (files.length === 0) {
    console.error('No run logs found in data/runs/');
    process.exit(1);
  }
  return path.join(RUNS_DIR, files[0].name);
}

const runFile = runArg ? path.resolve(runArg) : latestRunFile();

if (!fs.existsSync(runFile)) {
  console.error(`Run file not found: ${runFile}`);
  process.exit(1);
}

// ── Extract prompts ───────────────────────────────────────────────────────────

const lines = fs.readFileSync(runFile, 'utf-8').split('\n').filter(Boolean);
const prompts = lines
  .map(l => JSON.parse(l))
  .filter(e => e.type === 'prompt_rendered');

if (prompts.length === 0) {
  console.error(`No prompt_rendered entries found in ${path.basename(runFile)}`);
  console.error('Prompts are only logged when using the real AI agent (not --stub)');
  process.exit(1);
}

// ── Print ─────────────────────────────────────────────────────────────────────

console.log(`Run: ${path.basename(runFile)}\n`);

for (const entry of prompts) {
  const label = entry.segmentId ? `${entry.agentType}:${entry.segmentId}` : entry.agentType;
  console.log(`${'─'.repeat(60)}`);
  console.log(`PROMPT: ${label}  [${entry.timestamp}]`);
  console.log(`${'─'.repeat(60)}`);
  console.log(entry.prompt);
  console.log();
}
