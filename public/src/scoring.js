import { XP_PER_CORRECT } from "./constants.js";

/**
 * Counts correct answers from an answer-index list.
 * @param {number[]} answers
 * @param {import("./constants.js").Question[]} questions
 * @returns {number}
 */
export function calculateScore(answers, questions) {
  return answers.reduce(
    (score, answer, index) => score + Number(answer === questions[index]?.answerIndex),
    0,
  );
}

/**
 * Awards XP for correct responses.
 * @param {number} currentXp
 * @param {number} score
 * @returns {number}
 */
export function awardXp(currentXp, score) {
  return currentXp + score * XP_PER_CORRECT;
}
