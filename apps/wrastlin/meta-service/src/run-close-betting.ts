import { closeBetting } from './betting/stateService.js';

try {
  closeBetting();
} catch (err) {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
