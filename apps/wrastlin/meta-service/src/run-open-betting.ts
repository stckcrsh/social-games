import { openBetting } from './betting/stateService.js';

try {
  openBetting();
} catch (err) {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
