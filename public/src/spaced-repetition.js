import { DAY_MS, REVIEW_DAYS } from "./constants.js";

/**
 * Schedules a wrong answer at the next 1, 3, or 7 day interval.
 * @param {import("./constants.js").Progress} progress
 * @param {string} questionId
 * @param {string} date
 * @returns {import("./constants.js").Progress}
 */
export function scheduleReview(progress, questionId, date) {
  const previous = progress.reviews[questionId]?.stage ?? -1;
  const stage = Math.min(previous + 1, REVIEW_DAYS.length - 1);
  const due = new Date(Date.parse(`${date}T00:00:00Z`) + REVIEW_DAYS[stage] * DAY_MS);
  return {
    ...progress,
    reviews: {
      ...progress.reviews,
      [questionId]: { stage, dueDate: due.toISOString().slice(0, 10) },
    },
  };
}

/**
 * Removes a review when the learner answers it correctly.
 * @param {import("./constants.js").Progress} progress
 * @param {string} questionId
 * @returns {import("./constants.js").Progress}
 */
export function clearReview(progress, questionId) {
  const reviews = { ...progress.reviews };
  delete reviews[questionId];
  return { ...progress, reviews };
}
