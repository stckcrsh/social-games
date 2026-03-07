import { appendFile } from 'node:fs/promises';
import { getMutex } from '../storage/mutex-registry.js';
import type { AuditAction } from '../types/audit.js';

interface AuditEntryInput {
  action: AuditAction;
  playerId: string;
  targetId?: string;
  idempotencyKey?: string;
  requestId?: string;
  data: Record<string, unknown>;
}

export async function auditLog(auditPath: string, entry: AuditEntryInput): Promise<void> {
  const mutex = getMutex(auditPath);
  const record = {
    timestamp: new Date().toISOString(),
    ...entry,
  };
  await mutex.runExclusive(async () => {
    await appendFile(auditPath, JSON.stringify(record) + '\n', 'utf8');
  });
}
