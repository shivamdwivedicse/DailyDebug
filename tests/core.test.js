import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { dailySeed } from "../public/src/daily-seed.js";
import { selectDailyQuestions } from "../public/src/selector.js";
import { completePracticeRound, selectPracticeQuestions } from "../public/src/practice.js";
import { calculateScore, awardXp } from "../public/src/scoring.js";
import { updateStreak } from "../public/src/streak.js";
import { scheduleReview, clearReview } from "../public/src/spaced-repetition.js";
import { DARK_PALETTE, emptyProgress, MODES, PALETTE } from "../public/src/constants.js";
import { loadProgress, sanitizeProgress, saveProgress } from "../public/src/storage.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const questions = JSON.parse(readFileSync(resolve(root, "public/data/questions.json"), "utf8"));
const pythonCheck = spawnSync("python3", ["--version"], { encoding: "utf8" });

test("daily selection is stable for a date and changes on another date", () => {
  const progress = emptyProgress();
  const selected = selectDailyQuestions(questions, 1, "2026-11-22", progress);
  const first = selected.map((question) => question.id);
  assert.deepEqual(
    selectDailyQuestions(questions, 1, "2026-11-22", progress).map((question) => question.id),
    first,
  );
  assert.notDeepEqual(
    selectDailyQuestions(questions, 1, "2026-11-23", progress).map((question) => question.id),
    first,
  );
  assert.equal(first.length, 5);
  assert.equal(new Set(first).size, 5);
  assert.equal(new Set(selected.map((question) => question.mode)).size, 3);
});

test("daily seed includes year and date", () => {
  assert.equal(dailySeed(2, "2026-11-22"), dailySeed(2, "2026-11-22"));
  assert.notEqual(dailySeed(1, "2026-11-22"), dailySeed(2, "2026-11-22"));
});

test("scoring counts exact answer indexes and awards the configured XP", () => {
  const set = questions.slice(0, 3);
  assert.equal(
    calculateScore(
      set.map((question) => question.answerIndex),
      set,
    ),
    3,
  );
  assert.equal(
    calculateScore(
      set.map((question) => (question.answerIndex + 1) % question.options.length),
      set,
    ),
    0,
  );
  assert.equal(awardXp(40, 3), 100);
});

test("practice leaves streak, XP, reviews, and daily history untouched", () => {
  const progress = { ...emptyProgress(), streak: 6, xp: 240, lastPlayDate: "2026-11-22" };
  const practice = questions.filter((question) => question.year === 1).slice(0, 5);
  const result = completePracticeRound(
    progress,
    practice.map((question) => question.answerIndex),
    practice,
  );
  assert.equal(result.score, 5);
  assert.equal(result.earnedXp, 0);
  assert.equal(result.progress, progress);
  assert.equal(result.progress.streak, 6);
  assert.equal(result.progress.history.length, 0);
});

test("practice questions match the selected year and exclude today's daily set", () => {
  const dailyIds = selectDailyQuestions(questions, 3, "2026-11-22", emptyProgress()).map(
    (question) => question.id,
  );
  const practice = selectPracticeQuestions(questions, 3, dailyIds, () => 0);
  assert.equal(practice.length, 5);
  assert.equal(new Set(practice.map((question) => question.id)).size, 5);
  assert.ok(practice.every((question) => question.year === 3));
  assert.ok(practice.every((question) => !dailyIds.includes(question.id)));
});

test("streak continues, stays unchanged on the same day, and resets after a gap", () => {
  assert.deepEqual(updateStreak(4, "2026-11-21", "2026-11-22"), {
    streak: 5,
    lastPlayDate: "2026-11-22",
  });
  assert.deepEqual(updateStreak(4, "2026-11-22", "2026-11-22"), {
    streak: 4,
    lastPlayDate: "2026-11-22",
  });
  assert.deepEqual(updateStreak(4, "2026-11-20", "2026-11-22"), {
    streak: 1,
    lastPlayDate: "2026-11-22",
  });
});

test("wrong answers return at 1, 3, then 7 day intervals", () => {
  let progress = emptyProgress();
  progress = scheduleReview(progress, "y1-bug-range-stop", "2026-11-22");
  assert.equal(progress.reviews["y1-bug-range-stop"].dueDate, "2026-11-23");
  progress = scheduleReview(progress, "y1-bug-range-stop", "2026-11-23");
  assert.equal(progress.reviews["y1-bug-range-stop"].dueDate, "2026-11-26");
  progress = scheduleReview(progress, "y1-bug-range-stop", "2026-11-26");
  assert.equal(progress.reviews["y1-bug-range-stop"].dueDate, "2026-12-03");
  assert.equal(clearReview(progress, "y1-bug-range-stop").reviews["y1-bug-range-stop"], undefined);
});

test("corrupted and hostile storage values fall back to sanitized progress", () => {
  const brokenStorage = { getItem: () => "{broken" };
  assert.deepEqual(loadProgress(brokenStorage), emptyProgress());
  const hostile = sanitizeProgress({
    streak: -1,
    xp: "999",
    badges: [1, "<img>"],
    history: [null],
    reviews: { "bad id": {} },
  });
  assert.deepEqual(hostile, emptyProgress());
  assert.deepEqual(
    loadProgress({
      getItem: () => {
        throw new Error("blocked");
      },
    }),
    emptyProgress(),
  );
});

test("storage rejects invalid calendar dates and reports write failures", () => {
  assert.equal(sanitizeProgress({ lastPlayDate: "2026-02-31" }).lastPlayDate, "");
  assert.equal(
    saveProgress(emptyProgress(), {
      setItem: () => {
        throw new Error("blocked");
      },
    }),
    false,
  );
});

test("sanitized daily history retains its question IDs for later practice", () => {
  let serialized = "";
  const storage = {
    getItem: () => serialized,
    setItem: (_key, value) => {
      serialized = value;
    },
  };
  const progress = {
    ...emptyProgress(),
    history: [{ date: "2026-11-22", score: 4, questionIds: ["y1-one", "y1-two"] }],
  };
  assert.equal(saveProgress(progress, storage), true);
  assert.deepEqual(loadProgress(storage).history[0].questionIds, ["y1-one", "y1-two"]);
});

test("question bank has complete unique and correctly grouped content", () => {
  assertQuestionGroups();
  assertQuestionFields();
});

function assertQuestionGroups() {
  const ids = new Set(questions.map((question) => question.id));
  const prompts = new Set(questions.map((question) => question.prompt));
  assert.equal(questions.length, 120);
  assert.equal(ids.size, questions.length);
  assert.equal(prompts.size, questions.length);
  for (const year of [1, 2, 3, 4]) {
    for (const mode of MODES) {
      assert.equal(
        questions.filter((question) => question.year === year && question.mode === mode).length,
        10,
      );
    }
  }
}

function assertQuestionFields() {
  for (const question of questions) {
    assert.match(question.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(question.id.length <= 40);
    assert.ok(question.topic.trim() && question.prompt.trim() && question.explanation.trim());
    assert.ok(question.options.length >= 3 && question.options.length <= 4);
    assert.equal(new Set(question.options).size, question.options.length);
    assert.ok(question.answerIndex >= 0 && question.answerIndex < question.options.length);
    if (question.mode === "Predict the Output")
      assert.ok(question.code && question.expectedOutput !== undefined);
  }
}

test(
  "Python prediction snippets match their expected output",
  { skip: pythonCheck.error ? "python3 is not installed; prediction execution skipped." : false },
  () => {
    const predictions = questions.filter((question) => question.mode === "Predict the Output");
    const result = spawnSync("python3", ["-c", pythonRunner], {
      input: JSON.stringify(predictions),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    for (const actual of JSON.parse(result.stdout)) {
      assert.equal(
        actual.output,
        predictions.find((question) => question.id === actual.id).expectedOutput,
        actual.id,
      );
    }
  },
);

const pythonRunner = [
  "import contextlib, io, json, sys",
  "results = []",
  "for question in json.load(sys.stdin):",
  "    output = io.StringIO()",
  "    with contextlib.redirect_stdout(output):",
  "        exec(question['code'], {})",
  "    results.append({'id': question['id'], 'output': output.getvalue().rstrip('\\r\\n')})",
  "print(json.dumps(results))",
].join("\n");

function luminance(hex) {
  const rgb = hex.match(/[a-f\d]{2}/gi).map((part) => parseInt(part, 16) / 255);
  const channels = rgb.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test("palette text and component pairs meet WCAG AA contrast", () => {
  assert.ok(contrast(PALETTE.ink, PALETTE.paper) >= 4.5);
  assert.ok(contrast(PALETTE.white, PALETTE.blue) >= 4.5);
  assert.ok(contrast(PALETTE.ink, PALETTE.yellow) >= 4.5);
  assert.ok(contrast(PALETTE.green, PALETTE.white) >= 4.5);
  assert.ok(contrast(PALETTE.blue, PALETTE.paper) >= 3);
  assert.ok(contrast(DARK_PALETTE.ink, DARK_PALETTE.paper) >= 4.5);
  assert.ok(contrast(DARK_PALETTE.blue, DARK_PALETTE.card) >= 4.5);
  assert.ok(contrast(DARK_PALETTE.green, DARK_PALETTE.card) >= 4.5);
  assert.ok(contrast("#18304b", DARK_PALETTE.yellow) >= 4.5);
});

test("index and stylesheet include required accessibility structure", () => {
  const html = readFileSync(resolve(root, "public/index.html"), "utf8");
  const css = readFileSync(resolve(root, "public/styles.css"), "utf8");
  assert.doesNotMatch(html, /\b(?:innerHTML|outerHTML|insertAdjacentHTML|eval)\b/);
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /<style\b/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<title>[^<]+<\/title>/);
  assert.match(html, /class="skip-link"/);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
  assert.match(html, /<main\b/);
  assert.match(html, /aria-live=/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
});

test("frontend source avoids unsafe HTML sinks and inline styles", () => {
  const forbidden = /\b(?:innerHTML|outerHTML|insertAdjacentHTML|eval)\b/;
  for (const file of readdirSync(resolve(root, "public/src")).filter((entry) =>
    entry.endsWith(".js"),
  )) {
    const source = readFileSync(resolve(root, "public/src", file), "utf8");
    assert.doesNotMatch(source, forbidden, file);
    assert.doesNotMatch(source, /\.style\b/, file);
  }
  assert.doesNotMatch(readFileSync(resolve(root, "public/index.html"), "utf8"), /\sstyle\s*=/i);
});
