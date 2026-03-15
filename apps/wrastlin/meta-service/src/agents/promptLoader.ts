import fs from 'node:fs';
import path from 'node:path';

export function interpolate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => variables[key] ?? `{{${key}}}`);
}

export function loadPrompt(
  filename: string,
  variables: Record<string, string>,
): string {
  // Resolve dir inside the function so process.env.PROMPTS_DIR can be overridden
  // in tests after module load.
  const dir = process.env.PROMPTS_DIR
    ?? path.resolve(import.meta.dirname, '../../prompts');
  const template = fs.readFileSync(path.join(dir, filename), 'utf-8');
  return interpolate(template, variables);
}
