import type { FastifyInstance } from 'fastify';
import { getManager } from '../managers/managerService.js';
import { getWrestler } from '../wrestlers/wrestlerState.js';

const MOCK_RESPONSES: Record<string, string[]> = {
  high_ego: [
    "You think I need your help? I was born to be champion.",
    "Whatever you say. Just make sure the spotlight's on me.",
  ],
  honorable: [
    "I appreciate your counsel. I will fight with everything I have.",
    "My honor is not for sale. But I will heed your words.",
  ],
  coward: [
    "Are they dangerous? Maybe we should... avoid that matchup.",
    "I'll do it! But uh... can we have a backup plan?",
  ],
  default: [
    "Understood. I'll keep that in mind for the show.",
    "Noted. Let's see how this plays out.",
  ],
};

function pickResponse(ego: number, honor: number, anger: number): string {
  const responses =
    ego >= 8 ? MOCK_RESPONSES.high_ego
    : honor >= 8 ? MOCK_RESPONSES.honorable
    : anger <= 3 ? MOCK_RESPONSES.coward
    : MOCK_RESPONSES.default;
  return responses[Math.floor(Math.random() * responses.length)];
}

export async function managerRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/managers/:id', async (req, reply) => {
    const manager = getManager(req.params.id);
    if (!manager) return reply.status(404).send({ error: 'Manager not found' });
    return manager;
  });

  app.post<{
    Params: { id: string };
    Body: { message: string };
  }>('/managers/:id/chat', async (req, reply) => {
    const manager = getManager(req.params.id);
    if (!manager) return reply.status(404).send({ error: 'Manager not found' });

    const wrestler = getWrestler(manager.wrestlerId);
    if (!wrestler) return reply.status(500).send({ error: 'Wrestler not found' });

    const response = pickResponse(
      wrestler.personality.ego,
      wrestler.personality.honor,
      wrestler.personality.anger
    );

    return {
      wrestlerId: wrestler.wrestlerId,
      wrestlerName: wrestler.name,
      message: response,
      trustDelta: 0,
    };
  });
}
