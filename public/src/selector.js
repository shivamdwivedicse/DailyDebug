import { MODES, QUESTIONS_PER_DAY } from "./constants.js";
import { dailySeed, seededRandom } from "./daily-seed.js";

/**
 * Picks a date-stable, mode-balanced set, using due reviews in place of base picks.
 * @param {import("./constants.js").Question[]} bank
 * @param {number} year
 * @param {string} date
 * @param {import("./constants.js").Progress} progress
 * @returns {import("./constants.js").Question[]}
 */
export function selectDailyQuestions(bank, year, date, progress) {
  const random = seededRandom(dailySeed(year, date));
  const available = bank.filter((question) => question.year === year);
  const selected = dueReviews(available, progress, date).slice(0, QUESTIONS_PER_DAY);
  const chosen = new Set(selected.map((question) => question.id));
  const modes = MODES.map((mode) =>
    shuffle(
      available.filter((question) => question.mode === mode),
      random,
    ),
  );
  while (selected.length < QUESTIONS_PER_DAY) {
    const mode = MODES[selected.length % MODES.length];
    const next = modes[MODES.indexOf(mode)].find((question) => !chosen.has(question.id));
    if (!next) break;
    selected.push(next);
    chosen.add(next.id);
  }
  return shuffle(selected, random);
}

/**
 * Returns due question-bank entries in due-date order.
 * @param {import("./constants.js").Question[]} bank
 * @param {import("./constants.js").Progress} progress
 * @param {string} date
 * @returns {import("./constants.js").Question[]}
 */
function dueReviews(bank, progress, date) {
  return Object.entries(progress.reviews)
    .filter(([, review]) => review.dueDate <= date)
    .sort((left, right) => left[1].dueDate.localeCompare(right[1].dueDate))
    .map(([id]) => bank.find((question) => question.id === id))
    .filter(Boolean);
}

/**
 * Shuffles a copy of an array using a seeded random source.
 * @template T
 * @param {T[]} values
 * @param {() => number} random
 * @returns {T[]}
 */
function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
