import { QUESTIONS_PER_DAY } from "./constants.js";
import { calculateScore } from "./scoring.js";

/**
 * Selects random year-matched practice questions outside the daily set.
 * @param {import("./constants.js").Question[]} bank
 * @param {number} year
 * @param {string[]} dailyQuestionIds
 * @param {() => number} [random]
 * @returns {import("./constants.js").Question[]}
 */
export function selectPracticeQuestions(bank, year, dailyQuestionIds, random = Math.random) {
  const excluded = new Set(dailyQuestionIds);
  const pool = bank.filter((question) => question.year === year && !excluded.has(question.id));
  if (pool.length < QUESTIONS_PER_DAY)
    throw new Error("Not enough questions for a practice round.");
  for (let index = 0; index < QUESTIONS_PER_DAY; index += 1) {
    const swap = index + Math.floor(random() * (pool.length - index));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, QUESTIONS_PER_DAY);
}

/**
 * Finishes a practice round without awarding or changing learner progress.
 * @param {import("./constants.js").Progress} progress
 * @param {number[]} answers
 * @param {import("./constants.js").Question[]} questions
 * @returns {{ progress: import("./constants.js").Progress, score: number, earnedXp: 0 }}
 */
export function completePracticeRound(progress, answers, questions) {
  return { progress, score: calculateScore(answers, questions), earnedXp: 0 };
}
