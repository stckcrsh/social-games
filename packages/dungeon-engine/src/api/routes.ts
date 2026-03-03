import type { FastifyInstance } from 'fastify';
import { parsePreset } from '../models/presets.js';
import { renderGrid } from '../renderer/ascii.js';
import { store } from '../store.js';
import { processTurn } from '../engine/turn.js';
import { CreateRunSchema, PlayerActionSchema } from './schemas.js';

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

  // DELETE /runs/:id — discard run
  fastify.delete<{ Params: { id: string } }>('/runs/:id', async (request, reply) => {
    if (!store.has(request.params.id)) {
      return reply.status(404).send({ error: 'Run not found' });
    }
    store.delete(request.params.id);
    return reply.status(204).send();
  });
}
