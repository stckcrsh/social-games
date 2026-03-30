import fs from 'node:fs';
import path from 'node:path';

export type AgentType = 'showOutline' | 'matchBeats' | 'promoScreenplay' | 'announcerScreenplay';

export type LogEntry =
  | { type: 'run_started';      runId: string; week: number; mode: 'stub' | 'ai'; timestamp: string }
  | { type: 'agent_started';    runId: string; agentType: AgentType; segmentId: string | null; input: unknown; timestamp: string }
  | { type: 'prompt_rendered';  runId: string; agentType: AgentType; segmentId: string | null; prompt: string; timestamp: string }
  | { type: 'agent_completed';  runId: string; agentType: AgentType; segmentId: string | null; output: unknown; timestamp: string }
  | { type: 'agent_failed';     runId: string; agentType: AgentType; segmentId: string | null; error: string; timestamp: string }
  | { type: 'run_completed';    runId: string; showId: string; timestamp: string }
  | { type: 'run_failed';       runId: string; failedSegments: string[]; timestamp: string };

function cacheKey(agentType: AgentType, segmentId: string | null): string {
  return `${agentType}:${segmentId ?? 'root'}`;
}

export class RunLog {
  readonly runId: string;
  private readonly filePath: string;
  private readonly completionMap = new Map<string, unknown>();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.runId = path.basename(filePath, '.jsonl');

    if (fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
      for (const line of lines) {
        const entry = JSON.parse(line) as LogEntry;
        if (entry.type === 'agent_completed') {
          this.completionMap.set(cacheKey(entry.agentType, entry.segmentId), entry.output);
        }
      }
    }
  }

  append(entry: LogEntry): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  getCompleted(agentType: AgentType, segmentId: string | null): unknown | undefined {
    return this.completionMap.get(cacheKey(agentType, segmentId));
  }
}
