import { isIP } from "node:net";

/**
 * Resolves the requester's IP, trusting forwarding headers only when enabled.
 * @param {import("node:http").IncomingMessage} request
 * @returns {string}
 */
export function getClientIp(request) {
  const remoteAddress = request.socket.remoteAddress ?? "unknown";
  if (process.env.TRUST_PROXY !== "1") return remoteAddress;
  const forwarded = request.headers["x-forwarded-for"];
  if (!forwarded) return remoteAddress;
  const header = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
  return (
    header
      .split(",")
      .map((address) => address.trim())
      .find((address) => isIP(address) !== 0) ?? remoteAddress
  );
}
