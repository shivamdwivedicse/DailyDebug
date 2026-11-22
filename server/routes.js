import { explainWithGemini } from "./gemini.js";

const MAX_BODY_BYTES = 1_024;

/**
 * Creates the API handler for config and question-id-based explanations.
 * @param {{ questions: import("../public/src/constants.js").Question[], key: string, allowRequest: (client: string) => boolean, fetchImpl?: typeof fetch }} options
 * @returns {(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => Promise<boolean>}
 */
export function createApiHandler({ questions, key, allowRequest, fetchImpl }) {
  const byId = new Map(questions.map((question) => [question.id, question]));
  return async (request, response) => {
    const pathname = (request.url ?? "").split("?")[0];
    if (pathname !== "/api/config" && pathname !== "/api/explain") return false;
    if (pathname === "/api/config" && request.method === "GET") {
      sendJson(response, 200, { explainAvailable: Boolean(key) });
      return true;
    }
    if (pathname === "/api/explain" && request.method === "POST") {
      await handleExplain(request, response, { byId, key, allowRequest, fetchImpl });
      return true;
    }
    response.setHeader("Allow", pathname === "/api/config" ? "GET" : "POST");
    sendJson(response, 405, { error: "Method not allowed" });
    return true;
  };
}

/**
 * Validates and handles one explanation request without exposing upstream errors.
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 * @param {{ byId: Map<string, import("../public/src/constants.js").Question>, key: string, allowRequest: (client: string) => boolean, fetchImpl?: typeof fetch }} options
 * @returns {Promise<void>}
 */
async function handleExplain(request, response, { byId, key, allowRequest, fetchImpl }) {
  if (!allowRequest(request.socket.remoteAddress ?? "unknown"))
    return sendJson(response, 429, { error: "Please wait a moment before trying again." });
  if (!isJsonRequest(request))
    return sendJson(response, 415, { error: "JSON content is required." });
  try {
    const body = await readBody(request);
    const question = validRequest(body) ? byId.get(body.id) : undefined;
    if (!question) return sendJson(response, 400, { error: "Invalid question request." });
    await sendExplanation(response, question, key, fetchImpl);
  } catch (error) {
    sendJson(response, error.statusCode ?? 502, {
      error: "An explanation is unavailable right now.",
    });
  }
}

function isJsonRequest(request) {
  return /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
    request.headers["content-type"] ?? "",
  );
}

async function sendExplanation(response, question, key, fetchImpl) {
  if (!key) return sendJson(response, 200, { explanation: question.explanation, fallback: true });
  const explanation = await explainWithGemini({ question, key, fetchImpl });
  sendJson(response, 200, { explanation, fallback: false });
}

/**
 * Reads a small JSON body with a strict byte limit.
 * @param {import("node:http").IncomingMessage} request
 * @returns {Promise<unknown>}
 */
async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Invalid JSON");
    error.statusCode = 400;
    throw error;
  }
}

/**
 * Accepts exactly one syntactically valid question identifier.
 * @param {unknown} body
 * @returns {body is { id: string }}
 */
function validRequest(body) {
  return (
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    Object.keys(body).length === 1 &&
    typeof body.id === "string" &&
    /^[a-z0-9-]{1,40}$/.test(body.id)
  );
}

/**
 * Sends a generic JSON response with a no-store policy.
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {object} body
 * @returns {void}
 */
function sendJson(response, status, body) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.writeHead(status).end(JSON.stringify(body));
}
