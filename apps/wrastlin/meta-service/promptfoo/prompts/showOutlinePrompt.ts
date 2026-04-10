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
import { buildShowOutlineInput } from '../../src/agents/dataBuilders.js';
import { buildVariables } from '../../src/agents/openaiShowOutlineAgent.js';
import { loadPrompt } from '../../src/agents/promptLoader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Point loadPrompt at the real prompts directory
process.env['PROMPTS_DIR'] = path.resolve(__dirname, '../../prompts');

export default function renderShowOutlinePrompt({
  vars,
}: {
  vars: Record<string, unknown>;
}): string {
  const input = buildShowOutlineInput(
    Number(vars['week'] ?? 1),
    (vars['wrestlers'] as never[]) ?? [],
    (vars['managers'] as never[]) ?? [],
    (vars['submissions'] as never[]) ?? [],
    (vars['previousOutlines'] as never[]) ?? [],
    (vars['threads'] as never[]) ?? [],
  );

  const fullInput = {
    ...input,
    wrestlerThoughtProcess: (vars['thoughtProcess'] as never[]) ?? [],
  };

  return loadPrompt('show-outline.md', buildVariables(fullInput));
}
