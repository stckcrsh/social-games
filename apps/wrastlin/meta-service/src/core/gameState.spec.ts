import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Announcer } from '@org/wrastlin-shared';

describe('loadAnnouncers', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrastlin-gamestate-test-'));
    process.env.STATIC_DATA_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.STATIC_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('loads announcers from static data', async () => {
    const announcers: Announcer[] = [{
      announcerId: 'a-001',
      name: 'Test Announcer',
      role: 'play-by-play',
      theme: 'Energetic',
      catchphrases: ['Wow!'],
    }];
    fs.writeFileSync(path.join(tmpDir, 'announcers.json'), JSON.stringify(announcers));
    const { loadAnnouncers } = await import('./gameState.js');
    expect(loadAnnouncers()).toEqual(announcers);
  });

  it('throws if announcers.json is missing', async () => {
    const { loadAnnouncers } = await import('./gameState.js');
    expect(() => loadAnnouncers()).toThrow();
  });
});
