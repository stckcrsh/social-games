import { Mutex } from 'async-mutex';

const registry = new Map<string, Mutex>();

export function getMutex(filePath: string): Mutex {
  let mutex = registry.get(filePath);
  if (!mutex) {
    mutex = new Mutex();
    registry.set(filePath, mutex);
  }
  return mutex;
}
