import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { ReconcilePatch } from '@org/shared';
import { getMutex } from './mutex-registry.js';
import { atomicWrite } from './atomic-write.js';

export interface OutboxRecord {
  runId: string;
  patch: ReconcilePatch;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  lastAttemptAt?: number;
  lastError?: string;
}

function outboxPath(dataDir: string, runId: string): string {
  return path.join(dataDir, 'reconcile_outbox', `${runId}.json`);
}

export async function readOutboxRecord(dataDir: string, runId: string): Promise<OutboxRecord | null> {
  try {
    const raw = await readFile(outboxPath(dataDir, runId), 'utf8');
    return JSON.parse(raw) as OutboxRecord;
  } catch {
    return null;
  }
}

export async function writeOutboxRecord(dataDir: string, record: OutboxRecord): Promise<void> {
  const filePath = outboxPath(dataDir, record.runId);
  const mutex = getMutex(filePath);
  await mutex.runExclusive(() => atomicWrite(filePath, record));
}

export async function listOutboxRecords(dataDir: string): Promise<OutboxRecord[]> {
  const dir = path.join(dataDir, 'reconcile_outbox');
  let files: string[];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const records: OutboxRecord[] = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const raw = await readFile(path.join(dir, file), 'utf8');
      records.push(JSON.parse(raw) as OutboxRecord);
    } catch {
      // skip unreadable files
    }
  }
  return records;
}
