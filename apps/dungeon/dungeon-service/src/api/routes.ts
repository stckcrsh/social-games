import type { FastifyInstance } from 'fastify';
import type { GameEvent, PlayerAction, RunState } from '@org/shared';
import { parsePreset } from '../models/presets.js';
import { renderGrid } from '../renderer/ascii.js';
import { store } from '../store.js';
import { processTurn } from '../engine/turn.js';
import { runEnvironmentalPhase } from '../engine/environment.js';
import { getTile } from '@org/shared';
import { applyEffect } from '../engine/effects.js';
import { computeSlotView } from '@org/items';
import { CreateRunSchema, PlayerActionSchema, TickSchema, DebugOilSchema, DebugExplodeSchema } from './schemas.js';
import { pendingActions, broadcast, setDebugRun } from './ws.js';
import { DATA_DIR, META_SERVICE_URL } from '../config.js';
import { listOutboxRecords, readOutboxRecord, writeOutboxRecord } from '../storage/outbox-store.js';

function runResponse(state: RunState) {
  return { state, render: renderGrid(state), slots: computeSlotView(state.profile, state.runItemState) };
}

export async function runsPlugin(fastify: FastifyInstance): Promise<void> {
  // POST /runs — create a new run
  fastify.post('/runs', async (request, reply) => {
    const parseResult = CreateRunSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten() });
    }

    const { preset = 'default', config, profile, debug, metaMode, playerId, escrowId } = parseResult.data;
    const state = parsePreset(preset, config, profile, metaMode, playerId, escrowId);
    // Set pending status for normal (non-debug, non-bypass) runs
    if (!debug && metaMode !== 'bypass') {
      state.status = 'pending';
    }
    store.set(state);
    if (debug) setDebugRun(state.id);

    return reply.status(201).send({ runId: state.id, debug: !!debug, ...runResponse(state) });
  });

  // GET /runs/:id — get run state
  fastify.get<{ Params: { id: string } }>('/runs/:id', async (request, reply) => {
    const state = store.get(request.params.id);
    if (!state) return reply.status(404).send({ error: 'Run not found' });

    return reply.send(runResponse(state));
  });

  // GET /runs/:id/receipt — get startReceipt
  fastify.get<{ Params: { id: string } }>('/runs/:id/receipt', async (request, reply) => {
    const state = store.get(request.params.id);
    if (!state) return reply.status(404).send({ error: 'Run not found' });

    return reply.send(state.startReceipt);
  });

  // GET /runs/:id/reconcile-patch — get reconcilePatch (only set after run ends)
  fastify.get<{ Params: { id: string } }>('/runs/:id/reconcile-patch', async (request, reply) => {
    const state = store.get(request.params.id);
    if (!state) return reply.status(404).send({ error: 'Run not found' });
    if (!state.reconcilePatch) return reply.status(404).send({ error: 'Reconcile patch not yet computed' });

    return reply.send(state.reconcilePatch);
  });

  // POST /runs/:id/action — submit player action
  fastify.post<{ Params: { id: string } }>('/runs/:id/action', async (request, reply) => {
    const state = store.get(request.params.id);
    if (!state) return reply.status(404).send({ error: 'Run not found' });

    const parseResult = PlayerActionSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten() });
    }

    if (state.status !== 'active') {
      return reply.send({
        ...runResponse(state),
        turnEvents: [],
        error: `Run is already ${state.status}`,
      });
    }

    const { state: nextState, turnEvents, error } = processTurn(state, parseResult.data);
    store.set(nextState);

    return reply.send({
      ...runResponse(nextState),
      turnEvents,
      ...(error ? { error } : {}),
    });
  });

  // POST /runs/:id/tick — manually advance one turn (debug mode)
  fastify.post<{ Params: { id: string } }>('/runs/:id/tick', async (request, reply) => {
    const state = store.get(request.params.id);
    if (!state) return reply.status(404).send({ error: 'Run not found' });
    if (state.status !== 'active') {
      return reply.send({ ...runResponse(state), turnEvents: [], error: `Run is already ${state.status}` });
    }

    const pr = TickSchema.safeParse(request.body ?? {});
    if (!pr.success) return reply.status(400).send({ error: pr.error.flatten() });

    const action: PlayerAction = pr.data.action
      ?? pendingActions.get(request.params.id)
      ?? { type: 'wait' };
    pendingActions.delete(request.params.id);

    const { state: nextState, turnEvents, error } = processTurn(state, action);
    store.set(nextState);

    const payload = { ...runResponse(nextState), turnEvents, ...(error ? { error } : {}) };
    broadcast(request.params.id, payload);
    return reply.send(payload);
  });

  // POST /runs/:id/debug/oil — place oil at (x, y)
  fastify.post<{ Params: { id: string } }>('/runs/:id/debug/oil', async (req, reply) => {
    const state = store.get(req.params.id);
    if (!state) return reply.status(404).send({ error: 'Run not found' });
    const pr = DebugOilSchema.safeParse(req.body);
    if (!pr.success) return reply.status(400).send({ error: pr.error.flatten() });
    const tile = getTile(state.grid, pr.data.x, pr.data.y);
    if (!tile) return reply.status(400).send({ error: 'Out of bounds' });
    applyEffect(tile, { tag: 'oil' });
    return reply.send({ state, render: renderGrid(state) });
  });

  // POST /runs/:id/debug/explode — trigger explosion at (x, y)
  fastify.post<{ Params: { id: string } }>('/runs/:id/debug/explode', async (req, reply) => {
    const state = store.get(req.params.id);
    if (!state) return reply.status(404).send({ error: 'Run not found' });
    const pr = DebugExplodeSchema.safeParse(req.body);
    if (!pr.success) return reply.status(400).send({ error: pr.error.flatten() });
    const { x, y, radius = 1 } = pr.data;
    state.pendingExplosions.push({ x, y, radius });
    const turnEvents: GameEvent[] = [];
    runEnvironmentalPhase(state, turnEvents);
    return reply.send({ state, render: renderGrid(state), turnEvents });
  });

  // DELETE /runs/:id — discard run
  fastify.delete<{ Params: { id: string } }>('/runs/:id', async (request, reply) => {
    if (!store.has(request.params.id)) {
      return reply.status(404).send({ error: 'Run not found' });
    }
    store.delete(request.params.id);
    return reply.status(204).send();
  });

  // ─── Debug endpoints (non-production only) ───────────────────────────────────

  // GET /debug/reconcile-outbox — list all outbox records
  fastify.get('/debug/reconcile-outbox', async (request, reply) => {
    if (process.env['NODE_ENV'] === 'production') {
      return reply.status(403).send({ error: 'Debug endpoints disabled in production' });
    }
    const records = await listOutboxRecords(DATA_DIR);
    return reply.send(records);
  });

  // POST /debug/reconcile-outbox/:runId/retry — attempt to send patch to meta-service
  fastify.post<{ Params: { runId: string } }>('/debug/reconcile-outbox/:runId/retry', async (request, reply) => {
    if (process.env['NODE_ENV'] === 'production') {
      return reply.status(403).send({ error: 'Debug endpoints disabled in production' });
    }

    const record = await readOutboxRecord(DATA_DIR, request.params.runId);
    if (!record) return reply.status(404).send({ error: 'Outbox record not found' });

    // Bypass mode: no escrowId means nothing to send
    if (!record.patch.escrowId) {
      return reply.send({ status: 'skipped', reason: 'no escrowId (bypass mode)' });
    }

    const updatedRecord = { ...record, attempts: record.attempts + 1, lastAttemptAt: Date.now() };

    try {
      const res = await fetch(
        `${META_SERVICE_URL}/runs/escrows/${record.patch.escrowId}/resolve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(record.patch),
        }
      );

      if (res.ok) {
        updatedRecord.status = 'sent';
      } else {
        const errText = await res.text();
        updatedRecord.status = 'failed';
        updatedRecord.lastError = `HTTP ${res.status}: ${errText}`;
      }
    } catch (err: unknown) {
      updatedRecord.status = 'failed';
      updatedRecord.lastError = err instanceof Error ? err.message : String(err);
    }

    await writeOutboxRecord(DATA_DIR, updatedRecord);
    return reply.send({
      status: updatedRecord.status,
      attempts: updatedRecord.attempts,
      ...(updatedRecord.lastError ? { lastError: updatedRecord.lastError } : {}),
    });
  });
}
