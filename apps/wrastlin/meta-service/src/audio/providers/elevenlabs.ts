import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type { TtsInput, TtsProviderFn } from '../tts.js';

export function createElevenLabsProvider(apiKey: string): TtsProviderFn {
  const client = new ElevenLabsClient({ apiKey });

  return async (inputs: TtsInput[]): Promise<Buffer> => {
    const stream = await client.textToDialogue.convert({ inputs });
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  };
}
