import Fastify from 'fastify';

const app = Fastify({ logger: true });

app.get('/health', async () => ({ ok: true }));

const start = async () => {
  await app.listen({ port: 3002, host: '0.0.0.0' });
};

start();
