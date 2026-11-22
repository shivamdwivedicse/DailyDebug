import { HISTORY_LIMIT, QUESTIONS_PER_DAY, STORAGE_KEY, emptyProgress } from "./constants.js";

const MAX_REVIEWS = 200;
const MAX_BADGES = 10;
const MAX_STREAK = 100_000;
const MAX_XP = 10_000_000;
const MAX_SCORE = 5;
const MAX_REVIEW_STAGE = 2;

/**
 * Reads, validates, and sanitizes learner progress from storage.
 * @param {Storage} [storage]
 * @returns {import("./constants.js").Progress}
 */
export function loadProgress(storage = null) {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(STORAGE_KEY);
    if (!raw) return emptyProgress();
    return sanitizeProgress(JSON.parse(raw));
  } catch {
    return emptyProgress();
  }
}

/**
 * Persists validated progress, returning false when storage is unavailable.
 * @param {import("./constants.js").Progress} progress
 * @param {Storage} [storage]
 * @returns {boolean}
 */
export function saveProgress(progress, storage = null) {
  try {
    (storage ?? globalThis.localStorage).setItem(
      STORAGE_KEY,
      JSON.stringify(sanitizeProgress(progress)),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitizes a decoded progress value to the supported schema.
 * @param {unknown} value
 * @returns {import("./constants.js").Progress}
 */
export function sanitizeProgress(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyProgress();
  const record = value;
  return {
    streak: clamp(record.streak, 0, MAX_STREAK),
    xp: clamp(record.xp, 0, MAX_XP),
    badges: sanitizeBadges(record.badges),
    lastPlayDate: validDate(record.lastPlayDate) ? record.lastPlayDate : "",
    history: sanitizeHistory(record.history),
    reviews: sanitizeReviews(record.reviews),
  };
}

function sanitizeHistory(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && validDate(item.date) && Number.isInteger(item.score))
    .slice(-HISTORY_LIMIT)
    .map((item) => ({
      date: item.date,
      score: clamp(item.score, 0, MAX_SCORE),
      questionIds: sanitizeQuestionIds(item.questionIds),
    }));
}

function sanitizeQuestionIds(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(value.filter((id) => typeof id === "string" && /^[a-z0-9-]{1,40}$/.test(id))),
  ].slice(0, QUESTIONS_PER_DAY);
}

function sanitizeReviews(value) {
  const reviews = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return reviews;
  for (const [id, review] of Object.entries(value).slice(0, MAX_REVIEWS)) {
    if (/^[a-z0-9-]{1,40}$/.test(id) && review && validDate(review.dueDate)) {
      reviews[id] = { dueDate: review.dueDate, stage: clamp(review.stage, 0, MAX_REVIEW_STAGE) };
    }
  }
  return reviews;
}

function sanitizeBadges(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((badge) => typeof badge === "string" && /^[a-z0-9-]{1,32}$/.test(badge))
        .slice(0, MAX_BADGES),
    ),
  ];
}

/**
 * Clamps a value to an integer range or returns zero.
 * @param {unknown} value
 * @param {number} minimum
 * @param {number} maximum
 * @returns {number}
 */
function clamp(value, minimum, maximum) {
  return Number.isInteger(value) ? Math.min(maximum, Math.max(minimum, value)) : 0;
}

/**
 * Validates an ISO date string.
 * @param {unknown} value
 * @returns {value is string}
 */
function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
