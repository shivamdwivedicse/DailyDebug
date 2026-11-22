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

class DailyGame {
  constructor(bank) {
    this.bank = bank;
    this.state = {
      progress: loadProgress(),
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
      ["home", "play", "result"].map((name) => [name, document.querySelector(`#${name}-screen`)]),
    );
    this.connectEvents();
  }

  animateQuestionCard() {
    const card = document.querySelector(".question-card");
    card.classList.remove("question-enter");
    void card.offsetWidth;
    card.classList.add("question-enter");
  }

  start() {
    this.updateHome();
    showScreen(this.screens.home);
  }

  updateHome(animateXp = false) {
    const progress = this.state.progress;
    document.querySelector("#streak-count").textContent = String(progress.streak);
    if (animateXp) this.animateXp(progress.xp);
    else document.querySelector("#xp-count").textContent = String(progress.xp);
    document.querySelector("#xp-progress").value = progress.xp % XP_PER_LEVEL;
    document.querySelector("#year-choice").value = String(this.state.year);
    this.setStartLabel();
  }

  setStartLabel() {
    const completed = this.state.progress.history.some((entry) => entry.date === localDate());
    document.querySelector("#start-button").textContent = completed
      ? "See today’s result"
      : "Start today’s 5";
  }

  animateXp(target) {
    const counter = document.querySelector("#xp-count");
    const start = performance.now();
    const initial = Number(counter.textContent);
    const tick = (now) => {
      const progress = Math.min((now - start) / XP_COUNT_DURATION_MS, 1);
      counter.textContent = String(Math.round(initial + (target - initial) * progress));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  startSet() {
    this.state.year = Number(document.querySelector("#year-choice").value);
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

  prepareRound(heading, progressLabel) {
    this.state.answers = [];
    this.state.index = 0;
    document.querySelector("#play-heading").textContent = heading;
    document.querySelector("#daily-progress").max = this.state.questions.length;
    document.querySelector("#daily-progress").value = 0;
    document.querySelector("#daily-progress").setAttribute("aria-label", progressLabel);
    showScreen(this.screens.play);
    this.showQuestion();
  }

  showQuestion(focusPrompt = false) {
    const { questions, index } = this.state;
    const question = questions[index];
    renderQuestion(document.querySelector("#question-content"), question, index, questions.length);
    this.animateQuestionCard();
    document.querySelector("#daily-progress").value = index;
    document.querySelector("#daily-progress-label").textContent =
      `Question ${index + 1} of ${questions.length}`;
    this.resetFeedback(question);
    if (focusPrompt) document.querySelector(".question-prompt").focus();
  }

  resetFeedback(question) {
    document.querySelector("#feedback").textContent = "";
    document.querySelector("#explanation").textContent = "";
    document.querySelector("#check-button").disabled = false;
    document.querySelector("#next-button").disabled = true;
    document.querySelector("#explain-button").disabled = false;
    updateMascot(
      document.querySelector("#play-mascot"),
      this.mascotFor(question),
      "idle",
      "Let’s debug this together!",
    );
  }

  answerQuestion() {
    const selected = document.querySelector('input[name="answer"]:checked');
    const feedback = document.querySelector("#feedback");
    if (!selected) return this.showMissingAnswer(feedback);
    const question = this.state.questions[this.state.index];
    const answer = Number(selected.value);
    const correct = answer === question.answerIndex;
    this.recordAnswer(question, answer, correct);
    this.showAnswerFeedback(question, feedback, correct);
  }

  showMissingAnswer(feedback) {
    feedback.textContent = "Choose an answer first.";
    feedback.focus();
  }

  recordAnswer(question, answer, correct) {
    this.state.answers.push(answer);
    if (!this.state.practice) this.updateReview(question, correct);
    document.querySelector("#check-button").disabled = true;
    document.querySelector("#next-button").disabled = false;
  }

  updateReview(question, correct) {
    this.state.progress = correct
      ? clearReview(this.state.progress, question.id)
      : scheduleReview(this.state.progress, question.id, this.state.date);
  }

  showAnswerFeedback(question, feedback, correct) {
    feedback.textContent = `${correct ? "✓ Correct." : "✗ Not yet."} ${question.explanation}`;
    feedback.focus();
    document.querySelector("#explanation").textContent = question.explanation;
    const message = correct ? "Nice catch!" : "Close! Here’s why...";
    updateMascot(
      document.querySelector("#play-mascot"),
      this.mascotFor(question),
      correct ? "happy" : "sad",
      message,
    );
  }

  nextQuestion() {
    this.state.index += 1;
    if (this.state.index < this.state.questions.length) return this.showQuestion(true);
    this.finishSet();
  }

  finishSet() {
    if (this.state.practice) return this.finishPractice();
    const score = calculateScore(this.state.answers, this.state.questions);
    const earnedXp = score * XP_PER_CORRECT;
    this.state.completedScore = score;
    this.updateFinalProgress(score);
    this.renderFinalResult(score, earnedXp);
  }

  finishPractice() {
    const result = completePracticeRound(
      this.state.progress,
      this.state.answers,
      this.state.questions,
    );
    this.state.completedScore = result.score;
    this.renderPracticeResult(result);
  }

  renderPracticeResult(result) {
    renderResult(
      document.querySelector("#result-screen"),
      result.score,
      this.state.questions.length,
      result.earnedXp,
      { practice: true },
    );
    document.querySelector("#share-status").textContent = "";
    this.showResultMascot("celebrate", "Practice makes progress!");
    this.burstConfetti();
    showScreen(this.screens.result);
  }

  showResultMascot(pose, message) {
    updateMascot(document.querySelector("#result-mascot"), "byte", pose, message);
  }

  showCompletedResult(score) {
    this.state.completedScore = score;
    renderResult(document.querySelector("#result-screen"), score, QUESTIONS_PER_DAY, 0, {
      alreadyComplete: true,
    });
    this.showResultMascot("happy", "Already did it? Nice work!");
    showScreen(this.screens.result);
  }

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

  renderFinalResult(score, earnedXp) {
    const saved = saveProgress(this.state.progress);
    this.populateResult(score, earnedXp, saved);
    showScreen(this.screens.result);
  }

  populateResult(score, earnedXp, saved) {
    renderResult(
      document.querySelector("#result-screen"),
      score,
      this.state.questions.length,
      earnedXp,
    );
    document.querySelector("#share-status").textContent = saved
      ? ""
      : "Progress may not be saved in this browser.";
    this.updateHome(true);
    updateMascot(
      document.querySelector("#result-mascot"),
      "byte",
      "celebrate",
      "You showed up. That’s a win!",
    );
    this.burstConfetti();
  }

  async explainMore() {
    const question = this.state.questions[this.state.index];
    const output = document.querySelector("#explanation");
    output.textContent = question.explanation;
    updateMascot(document.querySelector("#play-mascot"), "cap", "idle", "Let’s unpack the why!");
    try {
      const result = await fetchExplanation(question.id);
      output.textContent = result.fallback
        ? `${result.explanation} (That’s the quick version for now.)`
        : result.explanation;
    } catch {
      output.textContent = `${question.explanation} (The extra explanation is taking a break.)`;
    }
  }

  burstConfetti() {
    const layer = document.querySelector("#confetti");
    layer.classList.remove("confetti-burst");
    void layer.offsetWidth;
    layer.classList.add("confetti-burst");
  }

  mascotFor(question) {
    if (question.mode === "Bug Hunt") return "bugsy";
    if (question.mode === "Predict the Output") return "byte";
    return "cap";
  }

  handleKeys(event) {
    if (this.screens.play.classList.contains("is-hidden")) return;
    if (/^[1-4]$/.test(event.key)) this.selectOption(Number(event.key) - 1);
    if (event.key === "Enter" && !event.target.matches("button")) this.confirmFromKeyboard(event);
  }

  confirmFromKeyboard(event) {
    event.preventDefault();
    if (document.querySelector("#next-button").disabled) this.answerQuestion();
    else this.nextQuestion();
  }

  selectOption(index) {
    const option = document.querySelector(`input[name="answer"][value="${index}"]`);
    if (option) option.checked = true;
  }

  async shareResult() {
    const score =
      this.state.completedScore ?? calculateScore(this.state.answers, this.state.questions);
    const { progress } = this.state;
    const text = this.state.practice
      ? `DailyDebug practice ${score}/${QUESTIONS_PER_DAY} streak ${progress.streak}`
      : `DailyDebug #${progress.history.length} ${score}/${QUESTIONS_PER_DAY} streak ${progress.streak}`;
    const copied = await copyText(text);
    document.querySelector("#share-status").textContent = copied
      ? "Result copied!"
      : "Could not copy. You can share your score by hand.";
  }

  connectEvents() {
    document.querySelector("#start-button").addEventListener("click", this.startSet.bind(this));
    document
      .querySelector("#answer-form")
      .addEventListener("submit", (event) => this.submitAnswer(event));
    document.querySelector("#next-button").addEventListener("click", this.nextQuestion.bind(this));
    document
      .querySelector("#explain-button")
      .addEventListener("click", this.explainMore.bind(this));
    document
      .querySelector("#home-button")
      .addEventListener("click", () => showScreen(this.screens.home));
    document
      .querySelector("#practice-button")
      .addEventListener("click", this.startPractice.bind(this));
    document.querySelector("#share-button").addEventListener("click", this.shareResult.bind(this));
    document.addEventListener("keydown", this.handleKeys.bind(this));
  }

  submitAnswer(event) {
    event.preventDefault();
    this.answerQuestion();
  }
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
