import { DAY_MS } from "./constants.js";

/**
 * Updates a streak once for a new local calendar day.
 * @param {number} streak
 * @param {string} lastDate
 * @param {string} today
 * @returns {{ streak: number, lastPlayDate: string }}
 */
export function updateStreak(streak, lastDate, today) {
  if (lastDate === today) return { streak, lastPlayDate: lastDate };
  const gap = dayGap(lastDate, today);
  return { streak: gap === 1 ? streak + 1 : 1, lastPlayDate: today };
}

/**
 * Calculates whole UTC calendar days between ISO dates.
 * @param {string} earlier
 * @param {string} later
 * @returns {number}
 */
function dayGap(earlier, later) {
  if (!isDate(earlier) || !isDate(later)) return 0;
  return Math.round(
    (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / DAY_MS,
  );
}

/**
 * Checks whether a value is a real ISO calendar date.
 * @param {string} value
 * @returns {boolean}
 */
function isDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}
