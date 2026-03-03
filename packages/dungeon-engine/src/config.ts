export const PORT    = parseInt(process.env['PORT']    ?? '3001', 10);
export const HOST    = process.env['HOST']    ?? '0.0.0.0';
export const TICK_MS = Number(process.env['TICK_MS'] ?? 1000);
