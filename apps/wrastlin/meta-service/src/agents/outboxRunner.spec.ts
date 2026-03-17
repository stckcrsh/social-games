import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RunLog } from './runLog.js';
import { OutboxRunner } from './outboxRunner.js';

describe('OutboxRunner', () => {
  let tmpDir: string;
  let filePath: string;
  let log: RunLog;
  let runner: OutboxRunner;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'outbox-test-'));
    filePath = path.join(tmpDir, 'week-1-20260317T120000.jsonl');
    log = new RunLog(filePath);
    runner = new OutboxRunner(log);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('calls agent and writes agent_started + agent_completed on cache miss', async () => {
    const agent = vi.fn().mockResolvedValue({ result: 'output' });
    const result = await runner.wrap('matchBeats', 'seg-1', agent)({ some: 'input' });

    expect(result).toEqual({ result: 'output' });
    expect(agent).toHaveBeenCalledTimes(1);

    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].type).toBe('agent_started');
    expect(lines[0].agentType).toBe('matchBeats');
    expect(lines[0].segmentId).toBe('seg-1');
    expect(lines[1].type).toBe('agent_completed');
    expect(lines[1].output).toEqual({ result: 'output' });
  });

  it('returns cached output without calling agent on cache hit', async () => {
    log.append({
      type: 'agent_completed', runId: log.runId,
      agentType: 'matchBeats', segmentId: 'seg-1',
      output: { cached: true }, timestamp: new Date().toISOString(),
    });
    const freshLog = new RunLog(filePath);
    const freshRunner = new OutboxRunner(freshLog);

    const agent = vi.fn().mockResolvedValue({ cached: false });
    const result = await freshRunner.wrap('matchBeats', 'seg-1', agent)({ some: 'input' });

    expect(result).toEqual({ cached: true });
    expect(agent).not.toHaveBeenCalled();
  });

  it('writes agent_failed and re-throws when agent throws', async () => {
    const agent = vi.fn().mockRejectedValue(new Error('API timeout'));
    await expect(runner.wrap('matchBeats', 'seg-1', agent)({ some: 'input' }))
      .rejects.toThrow('API timeout');

    const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].type).toBe('agent_started');
    expect(lines[1].type).toBe('agent_failed');
    expect(lines[1].error).toBe('API timeout');
  });

  it('does not write any events when returning from cache', async () => {
    log.append({
      type: 'agent_completed', runId: log.runId,
      agentType: 'matchBeats', segmentId: 'seg-1',
      output: { x: 1 }, timestamp: new Date().toISOString(),
    });
    const linesBefore = fs.readFileSync(filePath, 'utf-8').trim().split('\n').length;

    const freshLog = new RunLog(filePath);
    const freshRunner = new OutboxRunner(freshLog);
    await freshRunner.wrap('matchBeats', 'seg-1', vi.fn())({ input: true });

    const linesAfter = fs.readFileSync(filePath, 'utf-8').trim().split('\n').length;
    expect(linesAfter).toBe(linesBefore);
  });

  it('uses different cache keys for different segmentIds', async () => {
    log.append({
      type: 'agent_completed', runId: log.runId,
      agentType: 'matchBeats', segmentId: 'seg-1',
      output: { segment: 1 }, timestamp: new Date().toISOString(),
    });
    const freshLog = new RunLog(filePath);
    const freshRunner = new OutboxRunner(freshLog);

    const agent = vi.fn().mockResolvedValue({ segment: 2 });

    const seg1Result = await freshRunner.wrap('matchBeats', 'seg-1', agent)({ id: 1 });
    expect(seg1Result).toEqual({ segment: 1 });
    expect(agent).not.toHaveBeenCalled();

    const seg2Result = await freshRunner.wrap('matchBeats', 'seg-2', agent)({ id: 2 });
    expect(seg2Result).toEqual({ segment: 2 });
    expect(agent).toHaveBeenCalledTimes(1);
  });
});
