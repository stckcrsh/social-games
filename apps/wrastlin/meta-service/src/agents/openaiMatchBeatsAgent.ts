import OpenAI from 'openai';
import { loadPrompt } from './promptLoader.js';
import type { MatchBeatsAgentFn, MatchBeatsInput, MatchBeats } from './types.js';

function buildVariables(input: MatchBeatsInput): Record<string, string> {
  return {
    SEGMENT_JSON: JSON.stringify(input.segment, null, 2),
    WRESTLERS_JSON: JSON.stringify(input.wrestlers, null, 2),
    SEGMENT_ID: input.segment.segmentId,
  };
}

function isMatchBeats(val: unknown): val is MatchBeats {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.segmentId === 'string' &&
    Array.isArray(obj.beats) &&
    obj.result !== null && typeof obj.result === 'object'
  );
}

function extractJson(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

async function callOpenAI(client: OpenAI, prompt: string): Promise<MatchBeats> {
  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.choices[0]?.message?.content ?? '';
  const parsed: unknown = JSON.parse(extractJson(text));

  if (!isMatchBeats(parsed)) {
    throw new Error(`Response does not match MatchBeats schema: ${text.slice(0, 200)}`);
  }

  return parsed;
}

export function createOpenAIMatchBeatsAgent(
  apiKey: string,
  onPrompt?: (prompt: string) => void,
): MatchBeatsAgentFn {
  const client = new OpenAI({ apiKey });

  return async (input: MatchBeatsInput): Promise<MatchBeats> => {
    const prompt = loadPrompt('match-beats.md', buildVariables(input));
    onPrompt?.(prompt);

    try {
      return await callOpenAI(client, prompt);
    } catch (firstErr) {
      console.warn('MatchBeats agent attempt 1 failed, retrying:', (firstErr as Error).message);
      try {
        return await callOpenAI(client, prompt);
      } catch (secondErr) {
        console.error('MatchBeats agent attempt 2 failed:', (secondErr as Error).message);
        throw secondErr;
      }
    }
  };
}
