import type { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from '@fastify/websocket';
import { store } from '../store.js';
import { processTurn } from '../engine/turn.js';
import { renderGrid } from '../renderer/ascii.js';
import { PlayerActionSchema } from './schemas.js';
import type { PlayerAction } from '@org/shared';
import { TICK_MS } from '../config.js';
import { computeSlotView } from '@org/items';

// Per-run maps (module-level, outlive individual connections)
export const pendingActions = new Map<string, PlayerAction>();
const runTimers      = new Map<string, NodeJS.Timeout>();
const runClients     = new Map<string, Set<WebSocket>>();
const debugRuns      = new Set<string>();

export function setDebugRun(id: string): void { debugRuns.add(id); }

export function broadcast(id: string, payload: unknown): void {
  const clients = runClients.get(id);
  if (!clients) return;
  const msg = JSON.stringify(payload);
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(msg);
    }
  }
}

function stopRun(id: string): void {
  const timer = runTimers.get(id);
  if (timer) clearInterval(timer);
  runTimers.delete(id);
  debugRuns.delete(id);

  const clients = runClients.get(id);
  if (clients) {
    for (const ws of clients) {
      try { ws.close(); } catch { /* ignore */ }
    }
  }
  runClients.delete(id);
  pendingActions.delete(id);
}

function startTimer(id: string, fastify: FastifyInstance): void {
  const timer = setInterval(() => {
    const state = store.get(id);
    if (!state) {
      stopRun(id);
      return;
    }

    if (state.status !== 'active') {
      broadcast(id, {
        state,
        render: renderGrid(state),
        slots: computeSlotView(state.profile, state.runItemState),
        turnEvents: [],
      });
      stopRun(id);
      return;
    }

    const action = pendingActions.get(id) ?? { type: 'wait' } as PlayerAction;
    pendingActions.delete(id);

    const { state: nextState, turnEvents, error } = processTurn(state, action);
    store.set(nextState);

    broadcast(id, {
      state: nextState,
      render: renderGrid(nextState),
      slots: computeSlotView(nextState.profile, nextState.runItemState),
      turnEvents,
      ...(error ? { error } : {}),
    });

    if (nextState.status !== 'active') {
      stopRun(id);
    }
  }, TICK_MS);

  // Node: prevent the interval from keeping the process alive if nothing else is running
  if (typeof timer === 'object' && 'unref' in timer) {
    (timer as NodeJS.Timeout).unref();
  }

  runTimers.set(id, timer);
  fastify.log.info({ runId: id, tickMs: TICK_MS }, 'WS tick started');
}

export async function wsPlugin(fastify: FastifyInstance): Promise<void> {
  await fastify.register(fastifyWebsocket);

  fastify.get<{ Params: { id: string } }>(
    '/runs/:id/ws',
    { websocket: true },
    (socket, request) => {
      const id = request.params.id;

      const state = store.get(id);
      if (!state) {
        socket.send(JSON.stringify({ error: 'Run not found' }));
        socket.close();
        return;
      }

      // Register client
      if (!runClients.has(id)) {
        runClients.set(id, new Set());
      }
      runClients.get(id)!.add(socket);

      // Send current state immediately on connect
      socket.send(JSON.stringify({
        state,
        render: renderGrid(state),
        slots: computeSlotView(state.profile, state.runItemState),
        turnEvents: [],
      }));

      // For active runs (debug/bypass), start timer immediately on connect
      // For pending runs, wait for { type: 'start' } WS message
      const currentState = store.get(id);
      if (currentState?.status === 'active' && !runTimers.has(id)) {
        startTimer(id, fastify);
      }

      // Player sends actions as JSON
      socket.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());

          // Handle 'start' message — transitions pending → active
          if (parsed.type === 'start') {
            const runState = store.get(id);
            if (runState?.status === 'pending') {
              runState.status = 'active';
              store.set(runState);
              if (!runTimers.has(id)) {
                startTimer(id, fastify);
              }
              broadcast(id, {
                state: runState,
                render: renderGrid(runState),
                slots: computeSlotView(runState.profile, runState.runItemState),
                turnEvents: [{ type: 'run_start' }],
              });
            }
            return;
          }

          const result = PlayerActionSchema.safeParse(parsed);
          if (result.success) {
            pendingActions.set(id, result.data);
          } else {
            socket.send(JSON.stringify({ error: 'Invalid action', details: result.error.flatten() }));
          }
        } catch {
          socket.send(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });

      socket.on('close', () => {
        const clients = runClients.get(id);
        if (clients) {
          clients.delete(socket);
          if (clients.size === 0) {
            const timer = runTimers.get(id);
            if (timer) clearInterval(timer);
            runTimers.delete(id);
            runClients.delete(id);
            pendingActions.delete(id);
            fastify.log.info({ runId: id }, 'WS tick stopped (no clients)');
          }
        }
      });
    }
  );
}
