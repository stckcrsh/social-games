import type { FastifyPluginAsync } from 'fastify';
import {
  handleRegister,
  handleLogin,
  handleLogout,
  handleChangePassword,
  handleAdminResetPassword,
} from './handlers.js';

export const authRoutes: FastifyPluginAsync = async (server) => {
  server.post('/register', async (request, reply) =>
    handleRegister(server, request, reply)
  );

  server.post('/login', async (request, reply) =>
    handleLogin(server, request, reply)
  );

  server.post('/logout', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => handleLogout(request, reply),
  });

  server.post('/change-password', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => handleChangePassword(request, reply),
  });

  server.post('/admin/reset-password', {
    onRequest: [server.authenticate],
    handler: async (request, reply) => handleAdminResetPassword(request, reply),
  });
};
