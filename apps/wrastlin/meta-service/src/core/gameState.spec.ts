import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Announcer, NarrativeEvent, SocialThread } from '@org/wrastlin-shared';

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

describe('loadEvents / saveEvents', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrastlin-events-test-'));
    process.env.DYNAMIC_DATA_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.DYNAMIC_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('round-trips events through save and load', async () => {
    const { loadEvents, saveEvents } = await import('./gameState.js');
    const events: NarrativeEvent[] = [
      {
        eventId: 'e-001',
        week: 1,
        participants: ['w-001', 'w-002'],
        description: 'Steel interfered in Rex\'s match',
        tags: ['interference', 'public'],
      },
    ];
    saveEvents(events);
    expect(loadEvents()).toEqual(events);
  });

  it('returns empty array when events.json does not exist', async () => {
    const { loadEvents } = await import('./gameState.js');
    expect(loadEvents()).toEqual([]);
  });
});

describe('loadThreads / saveThreads', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrastlin-threads-test-'));
    process.env.DYNAMIC_DATA_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.DYNAMIC_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('round-trips threads through save and load', async () => {
    const { loadThreads, saveThreads } = await import('./gameState.js');
    const threads: SocialThread[] = [
      {
        threadId: 't-001',
        title: 'Rex vs Steel Conflict',
        subjects: ['w-001', 'w-002'],
        tags: ['conflict', 'public'],
        createdWeek: 1,
        lastUpdatedWeek: 1,
        eventIds: ['e-001'],
        actorStates: [
          { wrestlerId: 'w-001', care: 8, stance: 'aggrieved', summary: 'Rex sees this as unfinished business' },
          { wrestlerId: 'w-002', care: 3, stance: 'dismissive', summary: 'Purity barely remembers the incident' },
        ],
      },
    ];
    saveThreads(threads);
    expect(loadThreads()).toEqual(threads);
  });

  it('returns empty array when threads.json does not exist', async () => {
    const { loadThreads } = await import('./gameState.js');
    expect(loadThreads()).toEqual([]);
  });
});
