import {
  DEFAULT_YEAR,
  HISTORY_LIMIT,
  QUESTIONS_PER_DAY,
  XP_COUNT_DURATION_MS,
  XP_PER_CORRECT,
  XP_PER_LEVEL,
} from "./constants.js";
import { selectDailyQuestions } from "./selector.js";
import { calculateScore, awardXp } from "./scoring.js";
import { completePracticeRound, selectPracticeQuestions } from "./practice.js";
import { updateStreak } from "./streak.js";
import { clearReview, scheduleReview } from "./spaced-repetition.js";
import { loadProgress, saveProgress } from "./storage.js";
import { copyText, fetchExplanation } from "./api-client.js";
import { renderQuestion, renderResult, showScreen } from "./render.js";
import { updateMascot } from "./mascot.js";
import { findElement, getElement, setText, setValue } from "./dom.js";

class DailyGame {
  /**
   * Creates the game controller and connects screen events.
   * @param {import("./constants.js").Question[]} bank
   * @returns {void}
   */
  constructor(bank) {
    this.bank = bank;
    const progress = loadProgress();
    this.state = {
      progress,
      xp: progress.xp,
      questions: [],
      answers: [],
      index: 0,
      year: DEFAULT_YEAR,
      date: "",
      completedScore: null,
      practice: false,
      dailyQuestionIds: [],
    };
    this.screens = Object.fromEntries(
      ["home", "play", "result"].map((name) => [name, getElement(`#${name}-screen`)]),
    );
    this.connectEvents();
  }

  /**
   * Restarts the question-card entry animation without forcing layout.
   * @returns {void}
   */
  animateQuestionCard() {
    restartAnimation(getElement(".question-card"), "question-enter");
  }

  /**
   * Shows the home screen and its current progress.
   * @returns {void}
   */
  start() {
    this.updateHome();
    showScreen(this.screens.home);
  }

  /**
   * Updates home-screen progress and the daily challenge button label.
   * @param {boolean} [animateXp]
   * @returns {void}
   */
  updateHome(animateXp = false) {
    const progress = this.state.progress;
    setText("#streak-count", String(progress.streak));
    if (animateXp) this.animateXp(progress.xp);
    else {
      this.state.xp = progress.xp;
      setText("#xp-count", String(progress.xp));
    }
    setValue("#xp-progress", progress.xp % XP_PER_LEVEL);
    setValue("#year-choice", this.state.year);
    this.setStartLabel();
  }

  /**
   * Labels the start button according to today's completion state.
   * @returns {void}
   */
  setStartLabel() {
    const completed = this.state.progress.history.some((entry) => entry.date === localDate());
    setText("#start-button", completed ? "See today’s result" : "Start today’s 5");
  }

  /**
   * Animates the XP counter from its state value to the latest total.
   * @param {number} target
   * @returns {void}
   */
  animateXp(target) {
    const start = performance.now();
    const initial = this.state.xp;
    /**
     * Advances the counter while keeping the current value in application state.
     * @param {number} now
     * @returns {void}
     */
    const tick = (now) => {
      const progress = Math.min((now - start) / XP_COUNT_DURATION_MS, 1);
      this.state.xp = Math.round(initial + (target - initial) * progress);
      setText("#xp-count", String(this.state.xp));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /**
   * Starts today's challenge or restores its already-completed result.
   * @returns {void}
   */
  startSet() {
    this.state.year = Number(getElement("#year-choice").value);
    this.state.date = localDate();
    this.state.practice = false;
    const previous = this.state.progress.history.find((entry) => entry.date === this.state.date);
    if (previous) return this.restoreCompletedDaily(previous);
    this.state.questions = selectDailyQuestions(
      this.bank,
      this.state.year,
      this.state.date,
      this.state.progress,
    );
    this.state.dailyQuestionIds = this.state.questions.map((question) => question.id);
    this.state.completedScore = null;
    this.prepareRound("Today’s challenge", "Daily challenge progress");
  }

  /**
   * Restores the daily question IDs and shows their saved score.
   * @param {{ score: number, questionIds: string[] }} previous
   * @returns {void}
   */
  restoreCompletedDaily(previous) {
    this.state.dailyQuestionIds =
      previous.questionIds.length === QUESTIONS_PER_DAY
        ? previous.questionIds
        : selectDailyQuestions(
            this.bank,
            this.state.year,
            this.state.date,
            this.state.progress,
          ).map((question) => question.id);
    this.showCompletedResult(previous.score);
  }

  /**
   * Starts a no-reward practice round for the selected year.
   * @returns {void}
   */
  startPractice() {
    this.state.practice = true;
    this.state.questions = selectPracticeQuestions(
      this.bank,
      this.state.year,
      this.state.dailyQuestionIds,
    );
    this.state.completedScore = null;
    this.prepareRound("Practice round", "Practice round progress");
  }

  /**
   * Resets round state and opens the shared play screen.
   * @param {string} heading
   * @param {string} progressLabel
   * @returns {void}
   */
  prepareRound(heading, progressLabel) {
    this.state.answers = [];
    this.state.index = 0;
    setText("#play-heading", heading);
    getElement("#daily-progress").max = this.state.questions.length;
    setValue("#daily-progress", 0);
    getElement("#daily-progress").setAttribute("aria-label", progressLabel);
    showScreen(this.screens.play);
    this.showQuestion();
  }

  /**
   * Renders the active question and updates its progress and focus.
   * @param {boolean} [focusPrompt]
   * @returns {void}
   */
  showQuestion(focusPrompt = false) {
    const { questions, index } = this.state;
    const question = questions[index];
    renderQuestion(getElement("#question-content"), question, index, questions.length);
    this.animateQuestionCard();
    setValue("#daily-progress", index);
    setText("#daily-progress-label", `Question ${index + 1} of ${questions.length}`);
    this.resetFeedback(question);
    if (focusPrompt) getElement(".question-prompt").focus();
  }

  /**
   * Clears prior feedback and updates controls for the new question.
   * @param {import("./constants.js").Question} question
   * @returns {void}
   */
  resetFeedback(question) {
    setText("#feedback", "");
    setText("#explanation", "");
    getElement("#check-button").disabled = false;
    getElement("#next-button").disabled = true;
    getElement("#explain-button").disabled = false;
    updateMascot(
      getElement("#play-mascot"),
      this.mascotFor(question),
      "idle",
      "Let’s debug this together!",
    );
  }

  /**
   * Checks the selected answer and announces its feedback.
   * @returns {void}
   */
  answerQuestion() {
    const selected = findElement('input[name="answer"]:checked');
    const feedback = getElement("#feedback");
    if (!selected) return this.showMissingAnswer(feedback);
    const question = this.state.questions[this.state.index];
    const answer = Number(selected.value);
    const correct = answer === question.answerIndex;
    this.recordAnswer(question, answer, correct);
    this.showAnswerFeedback(question, feedback, correct);
  }

  /**
   * Moves focus to the validation message when no option is selected.
   * @param {HTMLElement} feedback
   * @returns {void}
   */
  showMissingAnswer(feedback) {
    setText("#feedback", "Choose an answer first.");
    feedback.focus();
  }

  /**
   * Records an answer and disables the answered controls.
   * @param {import("./constants.js").Question} question
   * @param {number} answer
   * @param {boolean} correct
   * @returns {void}
   */
  recordAnswer(question, answer, correct) {
    this.state.answers.push(answer);
    if (!this.state.practice) this.updateReview(question, correct);
    getElement("#check-button").disabled = true;
    getElement("#next-button").disabled = false;
  }

  /**
   * Updates spaced repetition for a daily answer.
   * @param {import("./constants.js").Question} question
   * @param {boolean} correct
   * @returns {void}
   */
  updateReview(question, correct) {
    this.state.progress = correct
      ? clearReview(this.state.progress, question.id)
      : scheduleReview(this.state.progress, question.id, this.state.date);
  }

  /**
   * Displays correctness, explanation text, and the matching mascot pose.
   * @param {import("./constants.js").Question} question
   * @param {HTMLElement} feedback
   * @param {boolean} correct
   * @returns {void}
   */
  showAnswerFeedback(question, feedback, correct) {
    setText("#feedback", `${correct ? "✓ Correct." : "✗ Not yet."} ${question.explanation}`);
    feedback.focus();
    setText("#explanation", question.explanation);
    const message = correct ? "Nice catch!" : "Close! Here’s why...";
    updateMascot(
      getElement("#play-mascot"),
      this.mascotFor(question),
      correct ? "happy" : "sad",
      message,
    );
  }

  /**
   * Advances to the next question or finishes the round.
   * @returns {void}
   */
  nextQuestion() {
    this.state.index += 1;
    if (this.state.index < this.state.questions.length) return this.showQuestion(true);
    this.finishSet();
  }

  /**
   * Finishes the current daily or practice round.
   * @returns {void}
   */
  finishSet() {
    if (this.state.practice) return this.finishPractice();
    const score = calculateScore(this.state.answers, this.state.questions);
    const earnedXp = score * XP_PER_CORRECT;
    this.state.completedScore = score;
    this.updateFinalProgress(score);
    this.renderFinalResult(score, earnedXp);
  }

  /**
   * Computes a practice result without changing learner progress.
   * @returns {void}
   */
  finishPractice() {
    const result = completePracticeRound(
      this.state.progress,
      this.state.answers,
      this.state.questions,
    );
    this.state.completedScore = result.score;
    this.renderPracticeResult(result);
  }

  /**
   * Renders a practice result on the shared result screen.
   * @param {{ score: number, earnedXp: number }} result
   * @returns {void}
   */
  renderPracticeResult(result) {
    renderResult(
      getElement("#result-screen"),
      result.score,
      this.state.questions.length,
      result.earnedXp,
      { practice: true },
    );
    setText("#share-status", "");
    this.showResultMascot("celebrate", "Practice makes progress!");
    this.burstConfetti();
    showScreen(this.screens.result);
  }

  /**
   * Updates the result mascot and its speech bubble.
   * @param {"idle" | "happy" | "sad" | "celebrate"} pose
   * @param {string} message
   * @returns {void}
   */
  showResultMascot(pose, message) {
    updateMascot(getElement("#result-mascot"), "byte", pose, message);
  }

  /**
   * Shows the saved result for a daily set already completed today.
   * @param {number} score
   * @returns {void}
   */
  showCompletedResult(score) {
    this.state.completedScore = score;
    renderResult(getElement("#result-screen"), score, QUESTIONS_PER_DAY, 0, {
      alreadyComplete: true,
    });
    this.showResultMascot("happy", "Already did it? Nice work!");
    showScreen(this.screens.result);
  }

  /**
   * Updates streak, XP, badges, and daily history after completion.
   * @param {number} score
   * @returns {void}
   */
  updateFinalProgress(score) {
    const state = this.state;
    state.progress = {
      ...state.progress,
      ...updateStreak(state.progress.streak, state.progress.lastPlayDate, state.date),
      xp: awardXp(state.progress.xp, score),
      history: [
        ...state.progress.history,
        { date: state.date, score, questionIds: state.dailyQuestionIds },
      ].slice(-HISTORY_LIMIT),
      badges:
        score === QUESTIONS_PER_DAY
          ? [...new Set([...state.progress.badges, "daily-debugger"])]
          : state.progress.badges,
    };
  }

  /**
   * Saves daily progress and shows its result.
   * @param {number} score
   * @param {number} earnedXp
   * @returns {void}
   */
  renderFinalResult(score, earnedXp) {
    const saved = saveProgress(this.state.progress);
    this.populateResult(score, earnedXp, saved);
    showScreen(this.screens.result);
  }

  /**
   * Populates the daily result and updates the home progress display.
   * @param {number} score
   * @param {number} earnedXp
   * @param {boolean} saved
   * @returns {void}
   */
  populateResult(score, earnedXp, saved) {
    renderResult(getElement("#result-screen"), score, this.state.questions.length, earnedXp);
    setText("#share-status", saved ? "" : "Progress may not be saved in this browser.");
    this.updateHome(true);
    updateMascot(getElement("#result-mascot"), "byte", "celebrate", "You showed up. That’s a win!");
    this.burstConfetti();
  }

  /**
   * Requests an optional explanation and falls back to the stored one.
   * @returns {Promise<void>}
   */
  async explainMore() {
    const question = this.state.questions[this.state.index];
    setText("#explanation", question.explanation);
    updateMascot(getElement("#play-mascot"), "cap", "idle", "Let’s unpack the why!");
    try {
      const result = await fetchExplanation(question.id);
      setText(
        "#explanation",
        result.fallback
          ? `${result.explanation} (That’s the quick version for now.)`
          : result.explanation,
      );
    } catch {
      setText("#explanation", `${question.explanation} (The extra explanation is taking a break.)`);
    }
  }

  /**
   * Restarts the decorative confetti animation.
   * @returns {void}
   */
  burstConfetti() {
    restartAnimation(getElement("#confetti"), "confetti-burst");
  }

  /**
   * Chooses the mascot assigned to a question mode.
   * @param {import("./constants.js").Question} question
   * @returns {"bugsy" | "byte" | "cap"}
   */
  mascotFor(question) {
    if (question.mode === "Bug Hunt") return "bugsy";
    if (question.mode === "Predict the Output") return "byte";
    return "cap";
  }

  /**
   * Handles answer shortcuts while the play screen is active.
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  handleKeys(event) {
    if (this.screens.play.classList.contains("is-hidden")) return;
    if (/^[1-4]$/.test(event.key)) this.selectOption(Number(event.key) - 1);
    if (event.key === "Enter" && !event.target.matches("button")) this.confirmFromKeyboard(event);
  }

  /**
   * Confirms or advances a round from the Enter key.
   * @param {KeyboardEvent} event
   * @returns {void}
   */
  confirmFromKeyboard(event) {
    event.preventDefault();
    if (getElement("#next-button").disabled) this.answerQuestion();
    else this.nextQuestion();
  }

  /**
   * Selects an answer option by its one-based keyboard shortcut.
   * @param {number} index
   * @returns {void}
   */
  selectOption(index) {
    const option = findElement(`input[name="answer"][value="${index}"]`);
    if (option) option.checked = true;
  }

  /**
   * Copies a concise summary of the current daily or practice result.
   * @returns {Promise<void>}
   */
  async shareResult() {
    const score =
      this.state.completedScore ?? calculateScore(this.state.answers, this.state.questions);
    const { progress } = this.state;
    const text = this.state.practice
      ? `DailyDebug practice ${score}/${QUESTIONS_PER_DAY} streak ${progress.streak}`
      : `DailyDebug #${progress.history.length} ${score}/${QUESTIONS_PER_DAY} streak ${progress.streak}`;
    const copied = await copyText(text);
    setText(
      "#share-status",
      copied ? "Result copied!" : "Could not copy. You can share your score by hand.",
    );
  }

  /**
   * Connects controls and keyboard events to game actions.
   * @returns {void}
   */
  connectEvents() {
    getElement("#start-button").addEventListener("click", this.startSet.bind(this));
    getElement("#answer-form").addEventListener("submit", (event) => this.submitAnswer(event));
    getElement("#next-button").addEventListener("click", this.nextQuestion.bind(this));
    getElement("#explain-button").addEventListener("click", this.explainMore.bind(this));
    getElement("#home-button").addEventListener("click", () => showScreen(this.screens.home));
    getElement("#practice-button").addEventListener("click", this.startPractice.bind(this));
    getElement("#share-button").addEventListener("click", this.shareResult.bind(this));
    document.addEventListener("keydown", this.handleKeys.bind(this));
  }

  /**
   * Prevents form navigation and checks the selected answer.
   * @param {SubmitEvent} event
   * @returns {void}
   */
  submitAnswer(event) {
    event.preventDefault();
    this.answerQuestion();
  }
}

/**
 * Restarts a CSS animation after one animation frame.
 * @param {HTMLElement} element
 * @param {string} className
 * @returns {void}
 */
function restartAnimation(element, className) {
  element.classList.remove(className);
  requestAnimationFrame(() => element.classList.add(className));
}

/**
 * Loads the bank and initializes the daily learning game.
 * @returns {Promise<void>}
 */
async function bootApp() {
  const response = await fetch("/data/questions.json");
  if (!response.ok) throw new Error("The daily question bank could not be loaded.");
  new DailyGame(await response.json()).start();
}

/**
 * Returns the current local date as an ISO calendar date.
 * @returns {string}
 */
function localDate() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

bootApp();
