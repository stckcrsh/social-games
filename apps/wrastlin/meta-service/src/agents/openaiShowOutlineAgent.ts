import OpenAI from 'openai';
import { loadPrompt } from './promptLoader.js';
import type { ShowOutlineAgentFn, ShowOutline, ShowOutlineInput } from './types.js';

function buildVariables(input: ShowOutlineInput): Record<string, string> {
  return {
    WEEK: String(input.week),
    PREVIOUS_OUTLINES_JSON: JSON.stringify(input.previousOutlines, null, 2),
    WRESTLERS_JSON: JSON.stringify(input.wrestlers, null, 2),
    SUBMISSIONS_JSON: JSON.stringify(input.submissions, null, 2),
  };
}

function isShowOutline(val: unknown): val is ShowOutline {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.showId === 'string' &&
    typeof obj.week === 'number' &&
    Array.isArray(obj.segments)
  );
}

function extractJson(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

async function callOpenAI(client: OpenAI, prompt: string): Promise<ShowOutline> {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.choices[0]?.message?.content ?? '';
  const parsed: unknown = JSON.parse(extractJson(text));

  if (!isShowOutline(parsed)) {
    throw new Error(`Response does not match ShowOutline schema: ${text.slice(0, 200)}`);
  }

  return parsed;
}

export function createOpenAIShowOutlineAgent(
  apiKey: string,
  onPrompt?: (prompt: string) => void,
): ShowOutlineAgentFn {
  const client = new OpenAI({ apiKey });

  return async (input: ShowOutlineInput): Promise<ShowOutline> => {
    const prompt = loadPrompt('show-outline.md', buildVariables(input));
    onPrompt?.(prompt);

    try {
      return await callOpenAI(client, prompt);
    } catch (firstErr) {
      console.warn('ShowOutline agent attempt 1 failed, retrying:', (firstErr as Error).message);
      try {
        return await callOpenAI(client, prompt);
      } catch (secondErr) {
        console.error('ShowOutline agent attempt 2 failed:', (secondErr as Error).message);
        throw secondErr;
      }
    }
  };
}
