import type { RunLog, AgentType } from './runLog.js';

export class OutboxRunner {
  constructor(private readonly log: RunLog) {}

  wrap<TInput, TOutput>(
    agentType: AgentType,
    segmentId: string | null,
    agent: (input: TInput) => Promise<TOutput>,
  ): (input: TInput) => Promise<TOutput> {
    return async (input: TInput): Promise<TOutput> => {
      const cached = this.log.getCompleted(agentType, segmentId);
      if (cached !== undefined) {
        return cached as TOutput;
      }

      this.log.append({
        type: 'agent_started',
        runId: this.log.runId,
        agentType,
        segmentId,
        input,
        timestamp: new Date().toISOString(),
      });

      try {
        const output = await agent(input);
        this.log.append({
          type: 'agent_completed',
          runId: this.log.runId,
          agentType,
          segmentId,
          output,
          timestamp: new Date().toISOString(),
        });
        return output;
      } catch (err) {
        this.log.append({
          type: 'agent_failed',
          runId: this.log.runId,
          agentType,
          segmentId,
          error: err instanceof Error ? err.message : String(err),
          timestamp: new Date().toISOString(),
        });
        throw err;
      }
    };
  }
}
