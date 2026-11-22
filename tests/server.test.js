import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { createServer } from "../server.js";
import { getClientIp } from "../server/client-ip.js";
import { loadEnv } from "../server/env.js";

/**
 * Starts a server on an ephemeral loopback port.
 * @param {object} [options]
 * @returns {Promise<{ server: import("node:http").Server, base: string }>}
 */
function startServer(options = {}) {
  const server = createServer(options);
  return new Promise((resolvePromise) => {
    server.listen(0, "127.0.0.1", () => {
      resolvePromise({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

/**
 * Closes an HTTP server after its test.
 * @param {import("node:http").Server} server
 * @returns {Promise<void>}
 */
function stopServer(server) {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}

/**
 * Sends a raw request path, preserving encoded traversal sequences.
 * @param {string} base
 * @param {string} path
 * @param {object} [options]
 * @returns {Promise<{ status: number, headers: import("node:http").IncomingHttpHeaders, body: string }>}
 */
function requestRaw(base, path, options = {}) {
  const target = new URL(base);
  return new Promise((resolvePromise, reject) => {
    const request = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path,
        method: options.method ?? "GET",
        headers: options.headers,
      },
      (response) => collectResponse(response, resolvePromise),
    );
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}

function collectResponse(response, resolvePromise) {
  const chunks = [];
  response.setEncoding("utf8");
  response.on("data", (chunk) => chunks.push(chunk));
  response.on("end", () =>
    resolvePromise({
      status: response.statusCode,
      headers: response.headers,
      body: chunks.join(""),
    }),
  );
}

function createGeminiMock() {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, options) => {
      calls.push({ url, key: options.headers["x-goog-api-key"] });
      return {
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "A useful explanation." }] } }],
        }),
      };
    },
  };
}

function assertSecurityHeaders(response) {
  assert.match(response.headers["content-security-policy"], /default-src 'self'/);
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["referrer-policy"], "no-referrer");
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.headers["permissions-policy"], "camera=(), microphone=(), geolocation=()");
  assert.equal(response.headers["cross-origin-opener-policy"], "same-origin");
  assert.equal(response.headers["cross-origin-resource-policy"], "same-origin");
}

function explainRequest(base) {
  return requestRaw(base, "/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "y1-bug-range-stop" }),
  });
}

function postExplain(base, body) {
  return requestRaw(base, "/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

test("client IP uses forwarded addresses only when proxy trust is enabled", (t) => {
  const previous = process.env.TRUST_PROXY;
  t.after(() => {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  });
  const request = {
    socket: { remoteAddress: "192.0.2.10" },
    headers: { "x-forwarded-for": "not-an-ip, 198.51.100.12, 203.0.113.1" },
  };
  delete process.env.TRUST_PROXY;
  assert.equal(getClientIp(request), "192.0.2.10");
  process.env.TRUST_PROXY = "1";
  assert.equal(getClientIp(request), "198.51.100.12");
});

test("server request and keep-alive timeouts are configured", () => {
  const server = createServer({ key: "" });
  assert.equal(server.requestTimeout, 10_000);
  assert.equal(server.headersTimeout, 10_000);
  assert.equal(server.keepAliveTimeout, 5_000);
});

test("static path traversal, dotfiles, and private project files return 404", async (t) => {
  const publicRoot = await mkdtemp(join(tmpdir(), "dailydebug-public-"));
  await writeFile(join(publicRoot, ".env"), "SENSITIVE_TEST_SECRET");
  const { server, base } = await startServer({ publicRoot });
  t.after(async () => {
    await stopServer(server);
    await rm(publicRoot, { recursive: true, force: true });
  });
  await assertTraversalDenied(base);
});

async function assertTraversalDenied(base) {
  for (const path of [
    "/%2e%2e/.env",
    "/..%2f.env",
    "/%2eenv",
    "/server.js",
    "/%00.env",
    "/..%5c.env",
  ]) {
    const response = await requestRaw(base, path);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(response.body, /SENSITIVE_TEST_SECRET/);
  }
}

test("API validates question ids and falls back without a key", async (t) => {
  const { server, base } = await startServer({ key: "" });
  t.after(() => stopServer(server));
  const unknown = await requestRaw(base, "/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "unknown-question" }),
  });
  assert.equal(unknown.status, 400);
  const fallback = await requestRaw(base, "/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "y1-bug-range-stop" }),
  });
  assert.equal(fallback.status, 200);
  assert.equal(JSON.parse(fallback.body).fallback, true);
  assert.match(JSON.parse(fallback.body).explanation, /stop value/);
});

test("API rejects oversized bodies, invalid media types, and wrong methods", async (t) => {
  const { server, base } = await startServer();
  t.after(() => stopServer(server));
  const oversized = await requestRaw(base, "/api/explain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: "x", padding: "a".repeat(1_100) }),
  });
  assert.equal(oversized.status, 413);
  const wrongType = await requestRaw(base, "/api/explain", {
    method: "POST",
    body: '{"id":"y1-bug-range-stop"}',
  });
  assert.equal(wrongType.status, 415);
  const wrongMethod = await requestRaw(base, "/api/explain", { method: "GET" });
  assert.equal(wrongMethod.status, 405);
  assert.equal((await requestRaw(base, "/", { method: "POST" })).status, 405);
});

test("API rejects malformed JSON and fields other than the question ID", async (t) => {
  const { server, base } = await startServer();
  t.after(() => stopServer(server));
  assert.equal((await postExplain(base, "{")).status, 400);
  assert.equal(
    (await postExplain(base, '{"id":"y1-bug-range-stop","prompt":"free text"}')).status,
    400,
  );
});

test("static assets use ETag revalidation and support HEAD", async (t) => {
  const { server, base } = await startServer();
  t.after(() => stopServer(server));
  const asset = await requestRaw(base, "/styles.css");
  assert.equal(asset.status, 200);
  assert.ok(asset.headers.etag);
  assert.match(asset.headers["cache-control"], /must-revalidate/);
  const cached = await requestRaw(base, "/styles.css", {
    headers: { "If-None-Match": asset.headers.etag },
  });
  assert.equal(cached.status, 304);
  const head = await requestRaw(base, "/styles.css", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.body, "");
});

test("security headers are present and a configured key never appears in responses", async (t) => {
  const secret = "never-return-this-test-key";
  const mock = createGeminiMock();
  const { server, base } = await startServer({ key: secret, fetchImpl: mock.fetchImpl });
  t.after(() => stopServer(server));
  const response = await requestRaw(base, "/api/config");
  assert.equal(JSON.parse(response.body).explainAvailable, true);
  assertSecurityHeaders(response);
  assert.equal(response.headers["strict-transport-security"], undefined);
  assert.doesNotMatch(JSON.stringify(response.headers) + response.body, new RegExp(secret));
  const explained = await explainRequest(base);
  assert.equal(explained.status, 200);
  assert.doesNotMatch(mock.calls[0].url, new RegExp(secret));
  assert.equal(mock.calls[0].key, secret);
  assert.doesNotMatch(explained.body + JSON.stringify(explained.headers), new RegExp(secret));
  const missing = await requestRaw(base, "/missing");
  assert.equal(missing.status, 404);
  assertSecurityHeaders(missing);
  assert.match(missing.headers["content-type"], /application\/json/);
});

test("HSTS is present only for forwarded HTTPS requests", async (t) => {
  const { server, base } = await startServer({ key: "" });
  t.after(() => stopServer(server));
  const response = await requestRaw(base, "/api/config", {
    headers: { "X-Forwarded-Proto": "https" },
  });
  assert.equal(response.headers["strict-transport-security"], "max-age=31536000");
  assert.equal(
    (await requestRaw(base, "/api/config")).headers["strict-transport-security"],
    undefined,
  );
});

test("local env parser reads the key without requiring a file", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dailydebug-env-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, ".env");
  await writeFile(file, "OTHER=value\nGEMINI_API_KEY='local-secret'\n");
  assert.deepEqual(loadEnv(file), { GEMINI_API_KEY: "local-secret" });
  assert.deepEqual(loadEnv(join(directory, "missing.env")), { GEMINI_API_KEY: "" });
});

test("per-client rate limit eventually returns 429", async (t) => {
  const { server, base } = await startServer({ key: "" });
  t.after(() => stopServer(server));
  const responses = [];
  for (let attempt = 0; attempt < 13; attempt += 1) {
    responses.push(
      await requestRaw(base, "/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "y1-bug-range-stop" }),
      }),
    );
  }
  assert.equal(responses.at(-1).status, 429);
});

test("API rate limits distinct forwarded clients only when proxy trust is enabled", async (t) => {
  const previous = process.env.TRUST_PROXY;
  t.after(() => {
    if (previous === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = previous;
  });
  process.env.TRUST_PROXY = "1";
  const { server, base } = await startServer({ key: "" });
  t.after(() => stopServer(server));
  for (let attempt = 1; attempt <= 13; attempt += 1) {
    const response = await explainFromForwardedIp(base, attempt);
    assert.equal(response.status, 200);
  }
});

function explainFromForwardedIp(base, attempt) {
  return requestRaw(base, "/api/explain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Forwarded-For": `198.51.100.${attempt}`,
    },
    body: JSON.stringify({ id: "y1-bug-range-stop" }),
  });
}
