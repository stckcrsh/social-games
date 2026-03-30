import fs from 'node:fs';
import path from 'node:path';

const STATIC_DIR = process.env.STATIC_DATA_DIR
  ?? path.resolve(import.meta.dirname, '../data/static');
const DYNAMIC_DIR = process.env.DYNAMIC_DATA_DIR
  ?? path.resolve(import.meta.dirname, '../data/runtime');

export function readStaticJson<T>(filename: string): T {
  const filepath = path.join(STATIC_DIR, filename);
  return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
}

export function readDynamicJson<T>(filename: string): T {
  const filepath = path.join(DYNAMIC_DIR, filename);
  return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as T;
}

export function writeDynamicJson<T>(filename: string, data: T): void {
  const filepath = path.join(DYNAMIC_DIR, filename);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
}

export function readJsonOrDefault<T>(
  filename: string,
  defaultValue: T,
  dir: 'static' | 'dynamic' = 'dynamic'
): T {
  try {
    return dir === 'static' ? readStaticJson<T>(filename) : readDynamicJson<T>(filename);
  } catch {
    return defaultValue;
  }
}
