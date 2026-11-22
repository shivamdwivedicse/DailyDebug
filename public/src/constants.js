/**
 * @typedef {object} Question
 * @property {string} id
 * @property {number} year
 * @property {string} mode
 * @property {string} topic
 * @property {string} prompt
 * @property {string} [code]
 * @property {string[]} options
 * @property {number} answerIndex
 * @property {string} explanation
 * @property {string} [expectedOutput]
 */

/**
 * @typedef {object} Progress
 * @property {number} streak
 * @property {number} xp
 * @property {string[]} badges
 * @property {string} lastPlayDate
 * @property {Array<{ date: string, score: number, questionIds?: string[] }>} history
 * @property {Record<string, { dueDate: string, stage: number }>} reviews
 */

export const STORAGE_KEY = "dailydebug.progress.v1";
export const MODES = Object.freeze(["Bug Hunt", "Predict the Output", "Quick Concept"]);
export const QUESTIONS_PER_DAY = 5;
export const XP_PER_CORRECT = 20;
export const XP_PER_LEVEL = 100;
export const DAY_MS = 86_400_000;
export const HISTORY_LIMIT = 30;
export const XP_COUNT_DURATION_MS = 420;
export const REVIEW_DAYS = Object.freeze([1, 3, 7]);
export const DEFAULT_YEAR = 1;
export const PALETTE = Object.freeze({
  ink: "#18304b",
  paper: "#fffaf0",
  blue: "#1351a3",
  yellow: "#f6ca45",
  coral: "#a83232",
  green: "#17633d",
  white: "#ffffff",
});
export const DARK_PALETTE = Object.freeze({
  ink: "#f4f3ec",
  paper: "#131e2d",
  card: "#202f42",
  blue: "#9dc5ff",
  yellow: "#f6ca45",
  green: "#93e2b3",
});

/**
 * Creates a fresh, empty learner progress record.
 * @returns {Progress}
 */
export function emptyProgress() {
  return { streak: 0, xp: 0, badges: [], lastPlayDate: "", history: [], reviews: {} };
}
