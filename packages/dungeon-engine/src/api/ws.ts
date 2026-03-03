import type { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from '@fastify/websocket';
import { store } from '../store.js';
import { processTurn } from '../engine/turn.js';
import { renderGrid } from '../renderer/ascii.js';
import { PlayerActionSchema } from './schemas.js';
import type { PlayerAction } from '../models/types.js';
import { TICK_MS } from '../config.js';

// Per-run maps (module-level, outlive individual connections)
const pendingActions = new Map<string, PlayerAction>();
const runTimers      = new Map<string, NodeJS.Timeout>();
const runClients     = new Map<string, Set<WebSocket>>();

function broadcast(id: string, payload: unknown): void {
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
      const { render } = { render: renderGrid(state) };
      broadcast(id, { state, render, turnEvents: [] });
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
        turnEvents: [],
      }));

      // Start timer only if not already running
      if (!runTimers.has(id)) {
        startTimer(id, fastify);
      }

      // Player sends actions as JSON
      socket.on('message', (raw) => {
        try {
          const parsed = JSON.parse(raw.toString());
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
