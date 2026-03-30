import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { BettingRunLog } from './runLog.js';

let tmpDir: string;
let logPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'betting-log-'));
  logPath = path.join(tmpDir, 'week-7.jsonl');
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true });
});

describe('BettingRunLog', () => {
  it('appends events as JSONL lines', () => {
    const log = new BettingRunLog(logPath);
    log.append({ type: 'judge_started', runId: 'run-1', week: 7, timestamp: 't' });

    const lines = fs.readFileSync(logPath, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ type: 'judge_started', week: 7 });
  });

  it('loads judgement_completed into cache on construction', () => {
    const log = new BettingRunLog(logPath);
    log.append({
      type: 'judgement_completed', runId: 'r', propositionId: 'prop-1',
      winningOptionIds: ['opt-a'], rationale: 'x', confidence: 'clear', timestamp: 't',
    });

    const reloaded = new BettingRunLog(logPath);
    expect(reloaded.isJudged('prop-1')).toBe(true);
  });

  it('loads judgement_flagged into judged cache on construction', () => {
    const log = new BettingRunLog(logPath);
    log.append({
      type: 'judgement_flagged', runId: 'r', propositionId: 'prop-2',
      reason: 'ambiguous', timestamp: 't',
    });

    const reloaded = new BettingRunLog(logPath);
    expect(reloaded.isJudged('prop-2')).toBe(true);
  });

  it('loads payout_applied into applied cache on construction', () => {
    const log = new BettingRunLog(logPath);
    log.append({
      type: 'payout_applied', runId: 'r', bettorId: 'm-001',
      entryId: 'entry-1', amount: 200, timestamp: 't',
    });

    const reloaded = new BettingRunLog(logPath);
    expect(reloaded.isPayoutApplied('entry-1')).toBe(true);
  });
});
