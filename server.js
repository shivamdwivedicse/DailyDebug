import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createApiHandler } from "./server/routes.js";
import { serveStatic } from "./server/static.js";
import { createRateLimiter } from "./server/rate-limit.js";
import { loadEnv } from "./server/env.js";
import { applySecurityHeaders } from "./server/security-headers.js";

const root = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 3_000;

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
  return createHttpServer(async (request, response) => {
    applySecurityHeaders(response);
    try {
      if (await api(request, response)) return;
      await serveStatic(request, response, publicRoot);
    } catch {
      if (!response.headersSent) {
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.writeHead(500).end(JSON.stringify({ error: "Something went wrong." }));
      }
    }
  });
}

function loadQuestions() {
  return JSON.parse(readFileSync(resolve(root, "public/data/questions.json"), "utf8"));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.listen(Number(process.env.PORT) || DEFAULT_PORT, "127.0.0.1", () => {
    console.log("DailyDebug is ready at http://127.0.0.1:3000");
  });
}
