import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('persistence', () => {
  let tmpDir: string;
  let staticDir: string;
  let dynamicDir: string;

  beforeEach(() => {
    vi.resetModules(); // Reset module cache so STATIC_DIR/DYNAMIC_DIR re-evaluate from env vars
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrastlin-persist-test-'));
    staticDir = path.join(tmpDir, 'static');
    dynamicDir = path.join(tmpDir, 'dynamic');
    fs.mkdirSync(staticDir);
    fs.mkdirSync(dynamicDir);
    process.env.STATIC_DATA_DIR = staticDir;
    process.env.DYNAMIC_DATA_DIR = dynamicDir;
  });

  afterEach(() => {
    delete process.env.STATIC_DATA_DIR;
    delete process.env.DYNAMIC_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('readStaticJson reads from STATIC_DATA_DIR', async () => {
    const { readStaticJson } = await import('./persistence.js');
    fs.writeFileSync(path.join(staticDir, 'test.json'), JSON.stringify({ x: 1 }));
    expect(readStaticJson('test.json')).toEqual({ x: 1 });
  });

  it('readDynamicJson reads from DYNAMIC_DATA_DIR', async () => {
    const { readDynamicJson } = await import('./persistence.js');
    fs.writeFileSync(path.join(dynamicDir, 'test.json'), JSON.stringify({ y: 2 }));
    expect(readDynamicJson('test.json')).toEqual({ y: 2 });
  });

  it('writeDynamicJson writes to DYNAMIC_DATA_DIR and creates subdirs', async () => {
    const { writeDynamicJson, readDynamicJson } = await import('./persistence.js');
    writeDynamicJson('bets/entries.json', [{ id: 'e1' }]);
    expect(readDynamicJson('bets/entries.json')).toEqual([{ id: 'e1' }]);
  });

  it('readJsonOrDefault returns default when dynamic file absent', async () => {
    const { readJsonOrDefault } = await import('./persistence.js');
    expect(readJsonOrDefault('missing.json', [])).toEqual([]);
  });

  it('readJsonOrDefault with dir=static returns default when static file absent', async () => {
    const { readJsonOrDefault } = await import('./persistence.js');
    expect(readJsonOrDefault('missing.json', null, 'static')).toBeNull();
  });
});
