import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createApiHandler } from "./server/routes.js";
import { serveStatic } from "./server/static.js";
import { createRateLimiter } from "./server/rate-limit.js";
import { loadEnv } from "./server/env.js";
import { applySecurityHeaders } from "./server/security-headers.js";
import { sendJson } from "./server/http.js";
import {
  DEFAULT_PORT,
  HEADERS_TIMEOUT_MS,
  KEEP_ALIVE_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
} from "./server/constants.js";

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Creates the DailyDebug HTTP server and loads the question bank once.
 * @param {{ key?: string, fetchImpl?: typeof fetch, publicRoot?: string, questions?: object[] }} [options]
 * @returns {import("node:http").Server}
 */
export function createServer(options = {}) {
  const questions = options.questions ?? loadQuestions();
  const key = options.key ?? loadEnv(resolve(root, ".env")).GEMINI_API_KEY;
  const allowRequest = createRateLimiter();
  const api = createApiHandler({ questions, key, allowRequest, fetchImpl: options.fetchImpl });
  const publicRoot = options.publicRoot ?? resolve(root, "public");
  const server = createHttpServer(handleRequest.bind(null, api, publicRoot));
  server.requestTimeout = REQUEST_TIMEOUT_MS;
  server.headersTimeout = HEADERS_TIMEOUT_MS;
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;
  return server;
}

/**
 * Routes one request through the API and static-file handlers.
 * @param {(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => Promise<boolean>} api
 * @param {string} publicRoot
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 * @returns {Promise<void>}
 */
async function handleRequest(api, publicRoot, request, response) {
  applySecurityHeaders(response, request);
  try {
    if (await api(request, response)) return;
    await serveStatic(request, response, publicRoot);
  } catch {
    if (!response.headersSent) sendJson(response, 500, { error: "Something went wrong." });
  }
}

/**
 * Reads and parses the packaged question bank.
 * @returns {object[]}
 */
function loadQuestions() {
  return JSON.parse(readFileSync(resolve(root, "public/data/questions.json"), "utf8"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  server.listen(port, process.env.HOST || "0.0.0.0", onListening);

  /**
   * Reports the port after the server starts listening.
   * @returns {void}
   */
  function onListening() {
    console.log(`DailyDebug is ready on port ${port}`);
  }
}
