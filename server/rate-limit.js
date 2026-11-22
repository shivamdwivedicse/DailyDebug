const WINDOW_MS = 60_000;
const MAX_REQUESTS = 12;
const MAX_CLIENTS = 5_000;

/**
 * Creates a bounded per-client request limiter.
 * @param {{ windowMs?: number, maxRequests?: number, maxClients?: number }} [options]
 * @returns {(client: string, now?: number) => boolean}
 */
export function createRateLimiter(options = {}) {
  const entries = new Map();
  const windowMs = options.windowMs ?? WINDOW_MS;
  const maxRequests = options.maxRequests ?? MAX_REQUESTS;
  const maxClients = options.maxClients ?? MAX_CLIENTS;

  return (client, now = Date.now()) => {
    for (const [key, entry] of entries) {
      if (now - entry.startedAt >= windowMs) entries.delete(key);
    }
    const entry = entries.get(client);
    if (entry && now - entry.startedAt < windowMs) {
      if (entry.count >= maxRequests) return false;
      entry.count += 1;
      return true;
    }
    if (!entry && entries.size >= maxClients) entries.delete(entries.keys().next().value);
    entries.set(client, { startedAt: now, count: 1 });
    return true;
  };
}
