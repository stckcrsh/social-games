import OpenAI from 'openai';
import type { BetProposition, Show } from '@org/wrastlin-shared';

// GeneratedShow does not exist in @org/wrastlin-shared; using Show instead.

export interface Judgement {
  winningOptionIds: string[];
  rationale: string;
  confidence: 'clear' | 'ambiguous';
}

const client = new OpenAI();

export async function judgeProposition(
  proposition: BetProposition,
  show: Show,
): Promise<Judgement> {
  const optionsList = proposition.options
    .map(o => `- ${o.optionId}: ${o.label}`)
    .join('\n');

  const prompt = `You are judging a wrestling show betting proposition.

A bet was placed before the show: "${proposition.statement}"

Players bet on these options:
${optionsList}

The show has now happened. Full show output:
${JSON.stringify(show, null, 2)}

Based on what happened in the show, determine which option won.

Respond with JSON only, no markdown:
{
  "winningOptionIds": ["<optionId>"],
  "rationale": "<one or two sentences explaining your decision>",
  "confidence": "clear"
}

Use "ambiguous" for confidence if the show output does not contain enough information to determine a winner.
Pick exactly one optionId from the list above.`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from judge agent');

  return JSON.parse(content) as Judgement;
}
