/**
 * tts-test.mts — Quick TTS test script
 *
 * Usage:
 *   npx tsx scripts/tts-test.mts <screenplay-file> [output-file]
 *
 * Example:
 *   npx tsx scripts/tts-test.mts scripts/sample-screenplay.txt output.mp3
 *
 * Screenplay format:
 *   [ACTOR NAME]: Line of dialogue.
 *   [ACTOR NAME]: [cheerfully] Line with an emotion tag.
 *   [PAUSE: 800]                          ← skipped (API has no pause support)
 *   [ACTOR NAME]: Another line.
 *
 * Emotion tags like [excitedly], [gravely], [whispering] etc. go INSIDE the
 * text and are passed directly to ElevenLabs — eleven_v3 model processes them.
 *
 * Voice map (scripts/voice-map.json):
 *   { "ACTOR NAME": "voice_id_here", ... }
 *
 * Environment:
 *   ELEVENLABS_API_KEY — required
 *   TTS_PROVIDER      — optional, defaults to "elevenlabs"
 */

import fs from 'node:fs';
import path from 'node:path';
import type { TtsProviderFn } from '../src/audio/tts.js';
import { createElevenLabsProvider } from '../src/audio/providers/elevenlabs.js';

// ── Config ────────────────────────────────────────────────────────────────────

const VOICE_MAP_PATH = path.resolve(import.meta.dirname, 'voice-map.json');
const DEFAULT_VOICE_ID = '9BWtsMINqrJLrRacOk9x'; // ElevenLabs demo voice

// ── Parse args ────────────────────────────────────────────────────────────────

const [, , screenplayArg, outputArg] = process.argv;

if (!screenplayArg) {
  console.error('Usage: npx tsx scripts/tts-test.mts <screenplay-file> [output-file]');
  process.exit(1);
}

const screenplayPath = path.resolve(screenplayArg);
const outputPath = path.resolve(outputArg ?? 'tts-output.mp3');

if (!fs.existsSync(screenplayPath)) {
  console.error(`File not found: ${screenplayPath}`);
  process.exit(1);
}

// ── Select provider ───────────────────────────────────────────────────────────

function buildProvider(): TtsProviderFn {
  const provider = process.env.TTS_PROVIDER ?? 'elevenlabs';

  if (provider === 'elevenlabs') {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.error('ELEVENLABS_API_KEY environment variable is not set.');
      process.exit(1);
    }
    console.log('Provider: ElevenLabs');
    return createElevenLabsProvider(apiKey);
  }

  console.error(`Unknown TTS_PROVIDER: "${provider}". Supported: elevenlabs`);
  process.exit(1);
}

// ── Load voice map ────────────────────────────────────────────────────────────

let voiceMap: Record<string, string> = {};
if (fs.existsSync(VOICE_MAP_PATH)) {
  voiceMap = JSON.parse(fs.readFileSync(VOICE_MAP_PATH, 'utf-8'));
  console.log(`Voice map: ${Object.keys(voiceMap).join(', ')}`);
} else {
  console.warn(`No voice-map.json found — using default voice for all actors.`);
}

function voiceFor(actorName: string): string {
  const key = Object.keys(voiceMap).find(
    k => k.toLowerCase() === actorName.toLowerCase(),
  );
  if (!key) console.warn(`  No voice mapped for "${actorName}" — using default`);
  return key ? voiceMap[key] : DEFAULT_VOICE_ID;
}

// ── Parse screenplay ──────────────────────────────────────────────────────────

const DIALOGUE_RE = /^\[([^\]]+)\]:\s*(.+)$/;
const PAUSE_RE = /^\[PAUSE:\s*(\d+)\]$/i;
const ACTORS_RE = /^ACTORS:/i;

function parseScreenplay(raw: string) {
  const inputs: { text: string; voiceId: string }[] = [];

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || ACTORS_RE.test(trimmed)) continue;

    if (PAUSE_RE.test(trimmed)) {
      const ms = trimmed.match(PAUSE_RE)![1];
      console.log(`  [skipping PAUSE: ${ms}ms]`);
      continue;
    }

    const match = trimmed.match(DIALOGUE_RE);
    if (match) {
      inputs.push({ text: match[2], voiceId: voiceFor(match[1]) });
    }
  }

  return inputs;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const provider = buildProvider();
const screenplay = fs.readFileSync(screenplayPath, 'utf-8');
const inputs = parseScreenplay(screenplay);

console.log(`\nParsed ${inputs.length} dialogue inputs from ${path.basename(screenplayPath)}`);

if (inputs.length === 0) {
  console.error('No dialogue lines found in screenplay.');
  process.exit(1);
}

console.log(`Sending to TTS provider...`);
const audio = await provider(inputs);

fs.writeFileSync(outputPath, audio);
console.log(`\nAudio saved to: ${outputPath} (${(audio.length / 1024).toFixed(1)} KB)`);
