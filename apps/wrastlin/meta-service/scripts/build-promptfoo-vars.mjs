#!/usr/bin/env node
/**
 * Reads each data/scenarios/outline/<name>/ folder and writes
 * promptfoo/vars/<name>/wrestlers.json + submissions.json.
 *
 * Replicates the same projection + manager-join logic as
 * buildShowOutlineInput() in src/agents/dataBuilders.ts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const metaServiceDir = path.resolve(__dirname, '..');
const scenariosDir = path.join(metaServiceDir, 'data', 'scenarios', 'outline');
const varsDir = path.join(metaServiceDir, 'promptfoo', 'vars');

const entries = fs.readdirSync(scenariosDir, { withFileTypes: true });
const scenarioNames = entries
  .filter(e => e.isDirectory())
  .map(e => e.name);

for (const name of scenarioNames) {
  const scenarioDir = path.join(scenariosDir, name);

  // Check if all required files exist
  const requiredFiles = ['wrestlers.json', 'managers.json', 'submissions.json'];
  const missingFiles = requiredFiles.filter(f => !fs.existsSync(path.join(scenarioDir, f)));
  if (missingFiles.length > 0) {
    console.log(`⊘ ${name}: skipped (missing ${missingFiles.join(', ')})`);
    continue;
  }

  const wrestlers = JSON.parse(fs.readFileSync(path.join(scenarioDir, 'wrestlers.json'), 'utf-8'));
  const managers  = JSON.parse(fs.readFileSync(path.join(scenarioDir, 'managers.json'),  'utf-8'));
  const submissions = JSON.parse(fs.readFileSync(path.join(scenarioDir, 'submissions.json'), 'utf-8'));

  // WrestlerSummaryForOutline — only the fields the prompt needs
  const wrestlerSummaries = wrestlers.map(w => ({
    wrestlerId:     w.wrestlerId,
    name:           w.name,
    gimmick:        w.gimmick,
    emotionalState: w.emotionalState,
  }));

  // SubmissionSummaryForOutline — join submission with manager to get wrestlerId
  const submissionSummaries = submissions
    .map(sub => {
      const manager = managers.find(m => m.managerId === sub.managerId);
      if (!manager) return null;
      return {
        managerId:   sub.managerId,
        wrestlerId:  manager.wrestlerId,
        showRequest: sub.showRequest,
        bribeAmount: sub.bribeAmount,
      };
    })
    .filter(Boolean);

  const outDir = path.join(varsDir, name);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'wrestlers.json'),
    JSON.stringify(wrestlerSummaries, null, 2),
  );
  fs.writeFileSync(
    path.join(outDir, 'submissions.json'),
    JSON.stringify(submissionSummaries, null, 2),
  );

  console.log(`✓ ${name}: ${wrestlerSummaries.length} wrestlers, ${submissionSummaries.length} submissions`);
}

console.log('Done.');
