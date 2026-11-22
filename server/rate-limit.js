import {
  RATE_LIMIT_MAX_CLIENTS,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
} from "./constants.js";

/**
 * Creates a bounded per-client request limiter.
 * @param {{ windowMs?: number, maxRequests?: number, maxClients?: number }} [options]
 * @returns {(client: string, now?: number) => boolean}
 */
export function createRateLimiter(options = {}) {
  const entries = new Map();
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW_MS;
  const maxRequests = options.maxRequests ?? RATE_LIMIT_MAX_REQUESTS;
  const maxClients = options.maxClients ?? RATE_LIMIT_MAX_CLIENTS;
  return allowRequest.bind(null, entries, windowMs, maxRequests, maxClients);
}

/**
 * Checks whether a client can make another request in the current window.
 * @param {Map<string, { startedAt: number, count: number }>} entries
 * @param {number} windowMs
 * @param {number} maxRequests
 * @param {number} maxClients
 * @param {string} client
 * @param {number} [now]
 * @returns {boolean}
 */
function allowRequest(entries, windowMs, maxRequests, maxClients, client, now = Date.now()) {
  pruneExpired(entries, now, windowMs);
  const entry = entries.get(client);
  if (entry && now - entry.startedAt < windowMs) {
    if (entry.count >= maxRequests) return false;
    entry.count += 1;
    return true;
  }
  if (!entry && entries.size >= maxClients) entries.delete(entries.keys().next().value);
  entries.set(client, { startedAt: now, count: 1 });
  return true;
}

/**
 * Removes rate-limit entries whose fixed window has elapsed.
 * @param {Map<string, { startedAt: number, count: number }>} entries
 * @param {number} now
 * @param {number} windowMs
 * @returns {void}
 */
function pruneExpired(entries, now, windowMs) {
  for (const [key, entry] of entries) {
    if (now - entry.startedAt >= windowMs) entries.delete(key);
  }
}
