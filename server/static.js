import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { sendJson } from "./http.js";
import { STATIC_CACHE_MAX_AGE_SECONDS } from "./constants.js";

const TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
});

/**
 * Serves only files rooted in public/, rejecting traversal and dotfiles.
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 * @param {string} publicRoot
 * @returns {Promise<void>}
 */
export async function serveStatic(request, response, publicRoot) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendJson(response, 405, { error: "Method not allowed." });
    return;
  }
  const target = safeTarget(request.url ?? "/", publicRoot);
  if (!target) return sendJson(response, 404, { error: "Not found." });
  try {
    const root = await realpath(publicRoot);
    const file = await realpath(target);
    if (!isInside(root, file)) return sendJson(response, 404, { error: "Not found." });
    await sendStaticFile(request, response, file);
  } catch {
    sendJson(response, 404, { error: "Not found." });
  }
}

/**
 * Writes a static asset with its content type and cache validator.
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 * @param {string} file
 * @returns {Promise<void>}
 */
async function sendStaticFile(request, response, file) {
  const contents = await readFile(file);
  const etag = `"${createHash("sha1").update(contents).digest("hex")}"`;
  response.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  response.setHeader(
    "Cache-Control",
    `public, max-age=${STATIC_CACHE_MAX_AGE_SECONDS}, must-revalidate`,
  );
  response.setHeader("ETag", etag);
  if (request.headers["if-none-match"] === etag) return response.writeHead(304).end();
  response.writeHead(200).end(request.method === "HEAD" ? undefined : contents);
}

/**
 * Resolves a request URL to a candidate file, or null when it is unsafe.
 * @param {string} requestUrl
 * @param {string} publicRoot
 * @returns {string | null}
 */
function safeTarget(requestUrl, publicRoot) {
  const rawPath = requestUrl.split("?")[0];
  if (rawPath.includes("\\") || rawPath.includes("\0")) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (decoded.includes("\\") || decoded.includes("\0")) return null;
  const segments = decoded.split("/");
  if (segments.some((part) => part === ".." || part.startsWith("."))) return null;
  const path = segments.filter(Boolean).join(sep) || "index.html";
  const target = resolve(join(publicRoot, path));
  return isInside(resolve(publicRoot), target) ? target : null;
}

/**
 * Checks that a candidate path is within its root directory.
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean}
 */
function isInside(root, candidate) {
  const path = relative(root, candidate);
  return path === "" || (!isAbsolute(path) && !path.startsWith(`..${sep}`) && path !== "..");
}
