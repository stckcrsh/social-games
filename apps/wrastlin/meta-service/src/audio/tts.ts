export interface TtsInput {
  text: string;
  voiceId: string;
}

/**
 * A TTS provider takes a list of dialogue inputs and returns an audio buffer.
 * Swap implementations to change the underlying service.
 */
export type TtsProviderFn = (inputs: TtsInput[]) => Promise<Buffer>;
