import type { FastifyInstance } from 'fastify';
import type { GameEvent } from '../models/types.js';
import { parsePreset } from '../models/presets.js';
import { renderGrid } from '../renderer/ascii.js';
import { store } from '../store.js';
import { processTurn } from '../engine/turn.js';
import { runEnvironmentalPhase } from '../engine/environment.js';
import { getTile } from '../engine/grid.js';
import { applyEffect } from '../engine/effects.js';
import { CreateRunSchema, PlayerActionSchema, DebugOilSchema, DebugExplodeSchema } from './schemas.js';

export async function runsPlugin(fastify: FastifyInstance): Promise<void> {
  // POST /runs — create a new run
  fastify.post('/runs', async (request, reply) => {
    const parseResult = CreateRunSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.flatten() });
    }

    const { preset = 'default', config } = parseResult.data;
    const state = parsePreset(preset, config);
    store.set(state);

    return reply.status(201).send({
      runId: state.id,
      state,
      render: renderGrid(state),
    });
  });

  // GET /runs/:id — get run state
  fastify.get<{ Params: { id: string } }>('/runs/:id', async (request, reply) => {
    const state = store.get(request.params.id);
    if (!state) return reply.status(404).send({ error: 'Run not found' });

    return reply.send({ state, render: renderGrid(state) });
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
        state,
        render: renderGrid(state),
        turnEvents: [],
        error: `Run is already ${state.status}`,
      });
    }

    const { state: nextState, turnEvents, error } = processTurn(state, parseResult.data);
    store.set(nextState);

    return reply.send({
      state: nextState,
      render: renderGrid(nextState),
      turnEvents,
      ...(error ? { error } : {}),
    });
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
}
