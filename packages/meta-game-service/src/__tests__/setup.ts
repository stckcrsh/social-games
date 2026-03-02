/**
 * Node 18 compatibility shim for vitest.
 * `diagnostics_channel.tracingChannel` was added in Node v19.
 */
import diagnostics_channel from 'node:diagnostics_channel';

const dc = diagnostics_channel as unknown as Record<string, unknown>;

if (typeof dc['tracingChannel'] !== 'function') {
  const noopChannel = { hasSubscribers: false, name: '' };

  dc['tracingChannel'] = () => ({
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
