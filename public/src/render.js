/**
 * Reveals a screen and moves focus to its heading.
 * @param {HTMLElement} screen
 * @returns {void}
 */
export function showScreen(screen) {
  document.querySelectorAll(".screen").forEach((item) => item.classList.add("is-hidden"));
  screen.classList.remove("is-hidden");
  screen.querySelector("h1, h2").focus();
}

/**
 * Renders one question using safe DOM APIs and textContent.
 * @param {HTMLElement} host
 * @param {import("./constants.js").Question} question
 * @param {number} index
 * @param {number} total
 * @returns {void}
 */
export function renderQuestion(host, question, index, total) {
  host.replaceChildren();
  host.append(makeText("p", "question-number", `Question ${index + 1} of ${total}`));
  host.append(makeText("p", "eyebrow", `${question.mode} · ${question.topic}`));
  const prompt = makeText("h3", "question-prompt", question.prompt);
  prompt.tabIndex = -1;
  host.append(prompt);
  if (question.code) host.append(makeCode(question.code));
  host.append(makeChoices(question.options));
}

/**
 * Renders the completion score and earned XP.
 * @param {HTMLElement} host
 * @param {number} score
 * @param {number} total
 * @param {number} earnedXp
 * @param {{ alreadyComplete?: boolean, practice?: boolean }} [options]
 * @returns {void}
 */
export function renderResult(host, score, total, earnedXp, options = {}) {
  host.querySelector("#result-eyebrow").textContent = options.practice
    ? "PRACTICE ROUND COMPLETE"
    : "DAILY DEBUG COMPLETE";
  host.querySelector("#result-score").textContent = `${score}/${total}`;
  host.querySelector("#result-message").textContent = resultMessage(score, total, options);
  host.querySelector("#earned-xp").textContent = xpMessage(earnedXp, options);
}

/**
 * Chooses the result message for daily and practice rounds.
 * @param {number} score
 * @param {number} total
 * @param {{ alreadyComplete?: boolean, practice?: boolean }} options
 * @returns {string}
 */
function resultMessage(score, total, { alreadyComplete, practice }) {
  if (practice) return "Practice round complete. Your streak and daily progress are unchanged.";
  if (alreadyComplete)
    return "You’ve logged today’s set. Come back tomorrow for a fresh challenge.";
  return score === total
    ? "Perfect catch! Your daily set is complete."
    : "Nice work showing up. Your next set is ready tomorrow.";
}

/**
 * Describes claimed, earned, or unavailable XP on the result screen.
 * @param {number} earnedXp
 * @param {{ alreadyComplete?: boolean, practice?: boolean }} options
 * @returns {string}
 */
function xpMessage(earnedXp, { alreadyComplete, practice }) {
  if (practice) return "Practice round · no XP";
  if (alreadyComplete) return "Daily XP already claimed";
  return `+${earnedXp} XP earned`;
}

/**
 * Creates a text-only element with a known class.
 * @param {string} tag
 * @param {string} className
 * @param {string} text
 * @returns {HTMLElement}
 */
function makeText(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}

/**
 * Creates a labeled, keyboard-operable radio group.
 * @param {string[]} options
 * @returns {HTMLFieldSetElement}
 */
function makeChoices(options) {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "answer-list";
  const legend = document.createElement("legend");
  legend.className = "visually-hidden";
  legend.textContent = "Choose one answer";
  fieldset.append(legend);
  options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "answer-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "answer";
    input.value = String(index);
    label.append(input, makeText("span", "answer-copy", option));
    fieldset.append(label);
  });
  return fieldset;
}

/**
 * Creates a code block with plain text.
 * @param {string} code
 * @returns {HTMLElement}
 */
function makeCode(code) {
  const pre = document.createElement("pre");
  pre.className = "code-sample";
  const element = document.createElement("code");
  element.textContent = code;
  pre.append(element);
  return pre;
}
