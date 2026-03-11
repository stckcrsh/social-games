import fs from 'node:fs';
import path from 'node:path';

const STATIC_DIR = '/tmp/wrastlin-e2e/static';
const DYNAMIC_DIR = '/tmp/wrastlin-e2e/runtime';

const FIXTURE_STATIC = path.resolve(__dirname, '../../meta-service/data/static');

const CLEAN_STATE = {
  currentWeek: 1,
  phase: 'week_open',
  updatedAt: new Date().toISOString(),
};

export default async function globalSetup() {
  // Clean up any leftover from a previous run
  if (fs.existsSync('/tmp/wrastlin-e2e')) {
    fs.rmSync('/tmp/wrastlin-e2e', { recursive: true });
  }

  // Create temp dirs
  fs.mkdirSync(STATIC_DIR, { recursive: true });
  fs.mkdirSync(path.join(DYNAMIC_DIR, 'bets'), { recursive: true });

  // Copy static seed files
  fs.copyFileSync(
    path.join(FIXTURE_STATIC, 'wrestlers.json'),
    path.join(STATIC_DIR, 'wrestlers.json')
  );
  fs.copyFileSync(
    path.join(FIXTURE_STATIC, 'managers.json'),
    path.join(STATIC_DIR, 'managers.json')
  );

  // Write clean runtime state
  fs.writeFileSync(
    path.join(DYNAMIC_DIR, 'state.json'),
    JSON.stringify(CLEAN_STATE, null, 2)
  );
  fs.writeFileSync(
    path.join(DYNAMIC_DIR, 'bets', 'propositions.json'),
    JSON.stringify([], null, 2)
  );
  fs.writeFileSync(
    path.join(DYNAMIC_DIR, 'bets', 'entries.json'),
    JSON.stringify([], null, 2)
  );
}
