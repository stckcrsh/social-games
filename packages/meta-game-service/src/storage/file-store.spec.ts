import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readJsonFile, updateJsonFile } from './file-store.js';
import { atomicWrite } from './atomic-write.js';

async function makeTmpDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'mgs-test-'));
}

describe('atomicWrite', () => {
  it('writes JSON to file', async () => {
    const dir = await makeTmpDir();
    const filePath = path.join(dir, 'test.json');
    await atomicWrite(filePath, { hello: 'world' });
    const content = JSON.parse(await readFile(filePath, 'utf8'));
    expect(content).toEqual({ hello: 'world' });
  });

  it('overwrites existing file atomically', async () => {
    const dir = await makeTmpDir();
    const filePath = path.join(dir, 'test.json');
    await atomicWrite(filePath, { v: 1 });
    await atomicWrite(filePath, { v: 2 });
    const content = JSON.parse(await readFile(filePath, 'utf8'));
    expect(content.v).toBe(2);
  });
});

describe('readJsonFile', () => {
  it('reads and parses JSON', async () => {
    const dir = await makeTmpDir();
    const filePath = path.join(dir, 'data.json');
    await writeFile(filePath, JSON.stringify({ count: 42 }), 'utf8');
    const data = await readJsonFile<{ count: number }>(filePath);
    expect(data.count).toBe(42);
  });

  it('throws on missing file', async () => {
    await expect(readJsonFile('/nonexistent/path.json')).rejects.toThrow();
  });
});

describe('mutex serialization', () => {
  it('50 concurrent increments result in exactly 50', async () => {
    const dir = await makeTmpDir();
    const filePath = path.join(dir, 'counter.json');
    await atomicWrite(filePath, { count: 0 });

    const increments = Array.from({ length: 50 }, () =>
      updateJsonFile<{ count: number }>(filePath, (data) => {
        return { count: data.count + 1 };
      })
    );

    await Promise.all(increments);
    const final = await readJsonFile<{ count: number }>(filePath);
    expect(final.count).toBe(50);
  });
});
