import OpenAI from 'openai';
import { loadPrompt } from './promptLoader.js';
import type { PromoScreenplayAgentFn, PromoScreenplayInput, PromoScreenplay, ScreenplayActor } from './types.js';

function buildVariables(input: PromoScreenplayInput): Record<string, string> {
  return {
    SEGMENT_JSON: JSON.stringify(input.segment, null, 2),
    PARTICIPANTS_JSON: JSON.stringify(input.participants, null, 2),
    TARGET_JSON: input.target ? JSON.stringify(input.target, null, 2) : 'None',
    PERSONAS_JSON: JSON.stringify(input.personas, null, 2),
    RELEVANT_THREADS_JSON: JSON.stringify(
      input.relevantThreads.map(rt => ({
        threadId: rt.thread.threadId,
        title: rt.thread.title,
        tags: rt.thread.tags,
        actorStates: rt.relevantActorStates,
        recentEvents: rt.linkedEvents.slice(0, 3).map(e => ({
          week: e.week,
          description: e.description,
        })),
      })),
      null, 2,
    ),
  };
}

function parseActors(actorsLine: string): ScreenplayActor[] {
  // "ACTORS: Rex Thunder (wrestler), Brock Calloway (interviewer)"
  return actorsLine
    .replace(/^ACTORS:\s*/i, '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const match = part.match(/^(.+?)\s*\((.+?)\)$/);
      if (!match) return { name: part, role: 'unknown' };
      return { name: match[1].trim(), role: match[2].trim() };
    });
}

function parseScreenplay(text: string, segmentId: string): PromoScreenplay {
  const lines = text.trim().split('\n');
  const actorsLineIndex = lines.findIndex(l => /^ACTORS:/i.test(l.trim()));

  const screenplayLines = actorsLineIndex !== -1
    ? lines.slice(0, actorsLineIndex)
    : lines;

  const actors: ScreenplayActor[] = actorsLineIndex !== -1
    ? parseActors(lines[actorsLineIndex].trim())
    : [];

  return {
    segmentId,
    actors,
    screenplay: screenplayLines.join('\n').trim(),
  };
}

export function createOpenAIPromoScreenplayAgent(
  apiKey: string,
  onPrompt?: (prompt: string) => void,
): PromoScreenplayAgentFn {
  const client = new OpenAI({ apiKey });

  return async (input: PromoScreenplayInput): Promise<PromoScreenplay> => {
    const prompt = loadPrompt('promo-screenplay.md', buildVariables(input));
    onPrompt?.(prompt);

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.choices[0]?.message?.content ?? '';
    if (!text) throw new Error('No content in promo screenplay response');

    return parseScreenplay(text, input.segment.segmentId);
  };
}
