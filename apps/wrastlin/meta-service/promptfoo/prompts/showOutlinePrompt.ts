/**
 * Promptfoo prompt function for the show outline agent.
 *
 * Receives raw scenario data (wrestlers, managers, submissions, etc.)
 * and runs the real buildShowOutlineInput + buildVariables + loadPrompt
 * pipeline so the rendered prompt is identical to what the agent sees in production.
 *
 * vars expected (all arrays, parsed from JSON by promptfoo):
 *   week               - number
 *   wrestlers          - Wrestler[]
 *   managers           - Manager[]
 *   submissions        - WeeklySubmission[]
 *   thoughtProcess     - WrestlerThoughtProcessOutput[]  (may be [])
 *   threads            - RetrievedThread[]               (may be [])
 *   previousOutlines   - ShowOutline[]                   (may be [])
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildShowOutlineInput, buildVariables, loadPrompt } from '../../dist/promptfoo-helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Point loadPrompt at the real prompts directory
process.env['PROMPTS_DIR'] = path.resolve(__dirname, '../../prompts');

function parseVar(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return JSON.parse(v) as unknown[];
  return [];
}

export default function renderShowOutlinePrompt({
  vars,
}: {
  vars: Record<string, unknown>;
}): string {
  const input = buildShowOutlineInput(
    Number(vars['week'] ?? 1),
    parseVar(vars['wrestlers']) as never[],
    parseVar(vars['managers']) as never[],
    parseVar(vars['submissions']) as never[],
    parseVar(vars['previousOutlines']) as never[],
    parseVar(vars['threads']) as never[],
  );

  const fullInput = {
    ...input,
    wrestlerThoughtProcess: parseVar(vars['thoughtProcess']) as never[],
  };

  return loadPrompt('show-outline.md', buildVariables(fullInput));
}
