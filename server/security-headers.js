import { HSTS_MAX_AGE_SECONDS } from "./constants.js";

/**
 * Applies the app-wide security headers to an HTTP response.
 * @param {import("node:http").ServerResponse} response
 * @param {import("node:http").IncomingMessage} request
 * @returns {void}
 */
export function applySecurityHeaders(response, request) {
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (request.headers["x-forwarded-proto"]?.toLowerCase() === "https") {
    response.setHeader("Strict-Transport-Security", `max-age=${HSTS_MAX_AGE_SECONDS}`);
  }
}
