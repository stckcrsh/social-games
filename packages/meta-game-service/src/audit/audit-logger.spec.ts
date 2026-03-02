import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { auditLog } from './audit-logger.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'mgs-audit-'));
}

describe('auditLog', () => {
  it('writes valid JSONL lines', async () => {
    const dir = await makeTmpDir();
    const auditPath = path.join(dir, 'audit.jsonl');

    await auditLog(auditPath, {
      action: 'player.login',
      playerId: 'player-1',
      data: { username: 'alice' },
    });

    await auditLog(auditPath, {
      action: 'shop.purchase',
      playerId: 'player-1',
      idempotencyKey: 'key-1',
      data: { offerId: 'offer_1' },
    });

    const raw = await readFile(auditPath, 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]!);
    expect(first.action).toBe('player.login');
    expect(first.playerId).toBe('player-1');
    expect(first.timestamp).toBeDefined();

    const second = JSON.parse(lines[1]!);
    expect(second.action).toBe('shop.purchase');
  });

  it('concurrent appends do not interleave lines', async () => {
    const dir = await makeTmpDir();
    const auditPath = path.join(dir, 'audit.jsonl');

    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        auditLog(auditPath, {
          action: 'player.login',
          playerId: `player-${i}`,
          data: { index: i },
        })
      )
    );

    const raw = await readFile(auditPath, 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(20);

    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
