import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { interpolate, loadPrompt } from './promptLoader.js';

describe('interpolate', () => {
  it('replaces a single placeholder', () => {
    expect(interpolate('Hello {{NAME}}', { NAME: 'World' })).toBe('Hello World');
  });

  it('replaces multiple placeholders', () => {
    const result = interpolate('{{A}} and {{B}}', { A: 'foo', B: 'bar' });
    expect(result).toBe('foo and bar');
  });

  it('replaces the same placeholder multiple times', () => {
    const result = interpolate('{{X}} then {{X}}', { X: '42' });
    expect(result).toBe('42 then 42');
  });

  it('leaves unknown placeholders intact', () => {
    const result = interpolate('{{KNOWN}} and {{UNKNOWN}}', { KNOWN: 'yes' });
    expect(result).toBe('yes and {{UNKNOWN}}');
  });

  it('returns the template unchanged when variables is empty', () => {
    expect(interpolate('no placeholders here', {})).toBe('no placeholders here');
  });
});

describe('loadPrompt', () => {
  let tmpDir: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompts-'));
    originalEnv = process.env.PROMPTS_DIR;
    process.env.PROMPTS_DIR = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
    if (originalEnv === undefined) {
      delete process.env.PROMPTS_DIR;
    } else {
      process.env.PROMPTS_DIR = originalEnv;
    }
  });

  it('reads a template file and interpolates placeholders', () => {
    fs.writeFileSync(path.join(tmpDir, 'test.md'), 'Hello {{NAME}}, week {{WEEK}}');
    const result = loadPrompt('test.md', { NAME: 'Rex', WEEK: '5' });
    expect(result).toBe('Hello Rex, week 5');
  });

  it('throws when the file does not exist', () => {
    expect(() => loadPrompt('missing.md', {})).toThrow();
  });
});
