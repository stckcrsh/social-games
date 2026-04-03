import OpenAI from 'openai';
import { loadPrompt } from './promptLoader.js';
import type {
  WrestlerThoughtProcessAgentFn,
  WrestlerThoughtProcessInput,
  WrestlerThoughtProcessOutput,
} from './types.js';

function buildVariables(input: WrestlerThoughtProcessInput): Record<string, string> {
  return {
    WRESTLER_NAME: input.wrestler.name,
    WRESTLER_GIMMICK: input.wrestler.gimmick,
    WRESTLER_ID: input.wrestler.wrestlerId,
    EMOTIONAL_STATE_JSON: JSON.stringify(input.wrestler.emotionalState, null, 2),
    PERSONALITY_JSON: JSON.stringify(input.wrestler.personality, null, 2),
    SUBMISSION_MESSAGE: input.submission?.wrestlerMessage ?? 'No message submitted this week.',
    STORY_REQUESTS_JSON: JSON.stringify(input.submission?.storyRequests ?? [], null, 2),
    ACTIVE_THREADS_JSON: JSON.stringify(input.activeThreads, null, 2),
  };
}

function isThoughtProcessOutput(val: unknown): val is WrestlerThoughtProcessOutput {
  if (!val || typeof val !== 'object') return false;
  const obj = val as Record<string, unknown>;
  return (
    typeof obj.wrestlerId === 'string' &&
    typeof obj.thoughtSummary === 'string' &&
    Array.isArray(obj.threadUpdates)
  );
}

function extractJson(text: string): string {
  return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

export function createOpenAIWrestlerThoughtProcessAgent(
  apiKey: string,
): WrestlerThoughtProcessAgentFn {
  const client = new OpenAI({ apiKey });

  return async (input: WrestlerThoughtProcessInput): Promise<WrestlerThoughtProcessOutput> => {
    const prompt = loadPrompt('wrestler-thought-process.md', buildVariables(input));

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.choices[0]?.message?.content ?? '';
    if (!text) throw new Error('No content in wrestler thought process response');

    const parsed: unknown = JSON.parse(extractJson(text));

    if (!isThoughtProcessOutput(parsed)) {
      throw new Error(`Response does not match WrestlerThoughtProcessOutput schema: ${text.slice(0, 200)}`);
    }

    return parsed;
  };
}
