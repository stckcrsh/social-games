import { applyPayouts } from './betting/applyPayouts.js';

try {
  applyPayouts();
} catch (err) {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}
