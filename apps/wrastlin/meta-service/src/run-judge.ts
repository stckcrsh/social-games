import { runJudge } from './betting/judgeRunner.js';

runJudge().catch(err => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
