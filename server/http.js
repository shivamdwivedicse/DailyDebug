/**
 * Sends a JSON response with the API's standard content and cache headers.
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {object} body
 * @returns {void}
 */
export function sendJson(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.writeHead(status).end(JSON.stringify(body));
}
