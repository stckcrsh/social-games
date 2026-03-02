/**
 * Node 18 compatibility shim.
 * `diagnostics_channel.tracingChannel` was added in Node v19.
 * Fastify 5 + Pino call it at startup; this must run before any require('fastify').
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dc = require('node:diagnostics_channel') as Record<string, unknown>;

if (typeof dc['tracingChannel'] !== 'function') {
  const noopChannel = { hasSubscribers: false, name: '' };

  dc['tracingChannel'] = () => ({
    // Node.js signature: traceSync(fn, context?, thisArg?, ...args)
    traceSync(fn: (...a: unknown[]) => unknown, _ctx: unknown, thisArg: unknown, ...args: unknown[]) {
      return fn.apply(thisArg, args);
    },
    tracePromise(fn: (...a: unknown[]) => Promise<unknown>, _ctx: unknown, thisArg: unknown, ...args: unknown[]) {
      return fn.apply(thisArg, args);
    },
    traceCallback(fn: (...a: unknown[]) => unknown, _ctx: unknown, thisArg: unknown, ...args: unknown[]) {
      return fn.apply(thisArg, args);
    },
    start: noopChannel,
    end: noopChannel,
    asyncStart: noopChannel,
    asyncEnd: noopChannel,
    error: noopChannel,
  });
}
