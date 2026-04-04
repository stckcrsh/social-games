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

describe('loadPreviousOutlines', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrastlin-outlines-test-'));
    fs.mkdirSync(path.join(tmpDir, 'shows'), { recursive: true });
    process.env.DYNAMIC_DATA_DIR = tmpDir;
  });

  afterEach(() => {
    delete process.env.DYNAMIC_DATA_DIR;
    fs.rmSync(tmpDir, { recursive: true });
  });

  function writeShow(week: number, showId: string) {
    fs.writeFileSync(
      path.join(tmpDir, 'shows', `week-${week}.json`),
      JSON.stringify({ showOutline: { showId, week, segments: [] }, segments: [], wrestlerThoughtProcess: [] }),
    );
  }

  it('returns empty array when no shows exist', async () => {
    const { loadPreviousOutlines } = await import('./gameState.js');
    expect(loadPreviousOutlines(1, 3)).toEqual([]);
  });

  it('returns show outlines for previous weeks in descending order', async () => {
    writeShow(1, 'show-1');
    writeShow(2, 'show-2');
    const { loadPreviousOutlines } = await import('./gameState.js');
    const result = loadPreviousOutlines(3, 3);
    expect(result).toHaveLength(2);
    expect(result[0].showId).toBe('show-2'); // most recent first
    expect(result[1].showId).toBe('show-1');
  });

  it('respects the limit', async () => {
    writeShow(1, 'show-1');
    writeShow(2, 'show-2');
    writeShow(3, 'show-3');
    const { loadPreviousOutlines } = await import('./gameState.js');
    const result = loadPreviousOutlines(4, 2);
    expect(result).toHaveLength(2);
    expect(result[0].showId).toBe('show-3');
    expect(result[1].showId).toBe('show-2');
  });

  it('skips missing weeks without error', async () => {
    writeShow(1, 'show-1');
    // week 2 missing
    writeShow(3, 'show-3');
    const { loadPreviousOutlines } = await import('./gameState.js');
    const result = loadPreviousOutlines(4, 3);
    expect(result).toHaveLength(2);
    expect(result.map(s => s.showId)).toEqual(['show-3', 'show-1']);
  });
});
