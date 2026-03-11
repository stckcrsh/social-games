import fs from 'node:fs';

export default async function globalTeardown() {
  if (fs.existsSync('/tmp/wrastlin-e2e')) {
    fs.rmSync('/tmp/wrastlin-e2e', { recursive: true });
  }
}
