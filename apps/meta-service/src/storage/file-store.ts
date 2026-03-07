import { readFile } from 'node:fs/promises';
import { getMutex } from './mutex-registry.js';
import { atomicWrite } from './atomic-write.js';

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

export async function withFileLock<T>(
  filePath: string,
  fn: () => Promise<T>
): Promise<T> {
  const mutex = getMutex(filePath);
  return mutex.runExclusive(fn);
}

export async function updateJsonFile<T>(
  filePath: string,
  updater: (current: T) => T | Promise<T>
): Promise<T> {
  return withFileLock(filePath, async () => {
    const current = await readJsonFile<T>(filePath);
    const updated = await updater(current);
    await atomicWrite(filePath, updated);
    return updated;
  });
}
