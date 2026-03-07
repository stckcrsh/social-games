import path from 'node:path';

export const PORT    = parseInt(process.env['PORT']    ?? '3001', 10);
export const HOST    = process.env['HOST']    ?? '0.0.0.0';
export const TICK_MS = Number(process.env['TICK_MS'] ?? 1000);
export const DATA_DIR = process.env['DATA_DIR'] ?? path.resolve(__dirname, '..', 'data');
export const META_SERVICE_URL = process.env['META_SERVICE_URL'] ?? 'http://localhost:3000';
