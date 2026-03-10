import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('readJson / writeJson', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wrastlin-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('round-trips JSON data', () => {
    const filepath = path.join(tmpDir, 'test.json');
    const data = { foo: 'bar', n: 42 };
    fs.writeFileSync(filepath, JSON.stringify(data));
    const result = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    expect(result).toEqual(data);
  });
});
