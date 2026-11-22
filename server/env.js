import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads the optional Gemini key from a local .env file without logging it.
 * @param {string} [filePath]
 * @returns {{ GEMINI_API_KEY: string }}
 */
export function loadEnv(filePath = resolve(process.cwd(), ".env")) {
  try {
    const contents = readFileSync(filePath, "utf8");
    const line = contents.split(/\r?\n/).find((entry) => /^\s*GEMINI_API_KEY\s*=/.test(entry));
    if (!line) return { GEMINI_API_KEY: "" };
    const value = line
      .slice(line.indexOf("=") + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    return { GEMINI_API_KEY: value };
  } catch {
    return { GEMINI_API_KEY: "" };
  }
}
