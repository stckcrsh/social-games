import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RunLog } from './runLog.js';
import type { LogEntry } from './runLog.js';

describe('RunLog', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runlog-test-'));
    filePath = path.join(tmpDir, 'week-1-20260317T120000.jsonl');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('derives runId from filename without extension', () => {
    const log = new RunLog(filePath);
    expect(log.runId).toBe('week-1-20260317T120000');
  });

  it('appends entries as JSON lines', () => {
    const log = new RunLog(filePath);
    const entry: LogEntry = {
      type: 'run_started', runId: log.runId, week: 1, mode: 'stub',
      timestamp: '2026-03-17T12:00:00Z',
    };
    log.append(entry);
    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual(entry);
  });

  it('getCompleted returns undefined for unknown key', () => {
    const log = new RunLog(filePath);
    expect(log.getCompleted('matchBeats', 'seg-1')).toBeUndefined();
  });

  it('builds completion map from existing file on construction', () => {
    const entry: LogEntry = {
      type: 'agent_completed', runId: 'week-1-20260317T120000',
      agentType: 'matchBeats', segmentId: 'seg-1',
      output: { beats: [] }, timestamp: '2026-03-17T12:00:01Z',
    };
    fs.writeFileSync(filePath, JSON.stringify(entry) + '\n');
    const log = new RunLog(filePath);
    expect(log.getCompleted('matchBeats', 'seg-1')).toEqual({ beats: [] });
  });

  it('ignores agent_failed entries when building completion map', () => {
    const entry: LogEntry = {
      type: 'agent_failed', runId: 'week-1-20260317T120000',
      agentType: 'matchBeats', segmentId: 'seg-1',
      error: 'timeout', timestamp: '2026-03-17T12:00:01Z',
    };
    fs.writeFileSync(filePath, JSON.stringify(entry) + '\n');
    const log = new RunLog(filePath);
    expect(log.getCompleted('matchBeats', 'seg-1')).toBeUndefined();
  });

  it('uses "root" key for null segmentId (showOutline)', () => {
    const entry: LogEntry = {
      type: 'agent_completed', runId: 'week-1-20260317T120000',
      agentType: 'showOutline', segmentId: null,
      output: { showId: 'stub-show-001', week: 1, segments: [] },
      timestamp: '2026-03-17T12:00:01Z',
    };
    fs.writeFileSync(filePath, JSON.stringify(entry) + '\n');
    const log = new RunLog(filePath);
    expect(log.getCompleted('showOutline', null)).toEqual({
      showId: 'stub-show-001', week: 1, segments: [],
    });
  });

  it('creates parent directories on first append', () => {
    const nestedPath = path.join(tmpDir, 'nested', 'dir', 'run.jsonl');
    const log = new RunLog(nestedPath);
    log.append({ type: 'run_started', runId: 'run', week: 1, mode: 'stub', timestamp: 't' });
    expect(fs.existsSync(nestedPath)).toBe(true);
  });
});
