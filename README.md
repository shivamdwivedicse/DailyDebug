# DailyDebug

## The problem

Engineering students study in bursts around exams and often have no daily practice habit. Existing study apps can feel like homework, making it harder to return consistently.

## Who it helps

Campus students in engineering years 1 to 4.

## Our solution

- A five-question daily challenge matched to the student's year.
- Instant answer feedback with a short explanation.
- Streaks, XP, and spaced repetition make practice feel like a game.

| Problem point         | Feature                                         | File                                                                                |
| --------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| No daily habit        | Date-seeded five-question daily challenge       | `public/src/daily-seed.js`, `public/src/selector.js`                                |
| Exam-time cramming    | Streaks and spaced reviews reinforce returning  | `public/src/streak.js`, `public/src/spaced-repetition.js`, `public/src/selector.js` |
| Boring study tools    | Colorful game feel, mascots, XP, and animations | `public/styles.css`, `public/src/mascot.js`, `public/src/main.js`                   |
| No instant feedback   | Answers immediately show correctness and why    | `public/src/main.js`, `public/src/render.js`                                        |
| Different year levels | Year selection and year-specific question bank  | `public/index.html`, `public/data/questions.json`, `public/src/selector.js`         |

## Approach

DailyDebug keeps practice small and rewarding. Each day offers a mode-mixed set covering a student's selected year. Questions are chosen with a seeded pseudo-random generator based on the local calendar date and year, so a learner gets the same base set when returning on the same day. Due spaced-repetition questions can take the place of base questions; this makes review personal while keeping the set at five. Wrong answers are scheduled after 1, 3, then 7 days.

The app has only Home, Play, and Result screens. It needs no account, framework, third-party runtime package, external font, or hosted asset. Browser progress stays in versioned localStorage. The optional explanation service accepts a bank question ID only; it uses the stored explanation whenever Gemini is not configured or available.

## How it works

```text
Choose year
    ↓
Seed(year + local date) → choose five mixed-mode questions
    ↓
Answer → see whether it is right + why → schedule/clear review
    ↓
Result → XP + streak + local history → return tomorrow or start a practice round
```

## Feature map

| Feature           | How it helps build a daily habit                                                      | Implementation                                                                           |
| ----------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Daily seed        | Provides a predictable, fresh five-question challenge for each year and date          | `public/src/daily-seed.js`, `public/src/selector.js`                                     |
| Streak            | Rewards returning on consecutive local calendar days                                  | `public/src/streak.js`, `public/src/main.js`                                             |
| Spaced repetition | Brings missed concepts back after increasing intervals                                | `public/src/spaced-repetition.js`, `public/src/selector.js`                              |
| Explanations      | Makes every answer a small learning moment, with optional extra detail                | `public/src/main.js`, `public/src/api-client.js`, `server/gemini.js`, `server/routes.js` |
| Game feel         | Makes five questions approachable through XP, progress, mascots, feedback, and motion | `public/index.html`, `public/styles.css`, `public/src/mascot.js`, `public/src/render.js` |
| Practice round    | Allows more questions without affecting daily progress or awarding XP                 | `public/src/practice.js`, `public/src/main.js`, `public/index.html`                      |

## Question content

`public/data/questions.json` contains 120 checked questions: ten per year for Bug Hunt, Predict the Output, and Quick Concept. Topics span programming, maths, physics, electronics, data structures, databases, digital logic, operating systems, networks, machine learning, system design, and interview patterns. Predict-the-output snippets are Python and are executed by the test suite against their expected output.

## Assumptions and limitations

- The learner selects their year; the app does not infer a curriculum or track a school.
- A date is the learner's local calendar date. Review questions replace seeded questions when due, so a set with reviews can differ between learners.
- A completed daily set and its XP are counted once per browser profile per local date. The Result screen offers a five-question practice round that excludes today's daily questions and does not change streak, daily progress, or XP.
- Progress is local to one browser profile and is not synchronized or backed up. Clearing browser storage resets it.
- The game has no timer, sound, accounts, leaderboard, settings screen, or social feed.
- Explain-more uses the fixed Gemini model only when a server-side key is configured and the server can reach the Gemini API. Otherwise, the built-in explanation remains available.
- The Python-output test is skipped with a clear message if `python3` is not installed.

## Security

The Node server serves files only from `public/`, rejects traversal, encoded traversal, dotfiles, null bytes, backslashes, and symlink escapes, and applies a strict Content Security Policy and other security headers. The explanation endpoint accepts only a small JSON object with an ID already present in the question bank; it has a bounded per-IP rate limiter and never returns upstream error details.

The Gemini key lives only in the server's local `.env` file. It is read by `server/env.js`, is never sent to the browser, and is never logged. `.env` is ignored by Git. The browser sends only a question ID and renders explanation text with `textContent`.

## Accessibility

The UI provides a skip link, semantic landmarks, one main heading, labeled year selection and radio answers, visible focus, screen-reader live feedback, and focus movement to screen headings and answer feedback. Keys 1–4 select an answer; Enter checks or advances. Feedback includes text and a symbol rather than relying on color alone. The palette's foreground/background pairs are checked against WCAG AA contrast thresholds in a test. Dark color-scheme and reduced-motion preferences are supported. Controls have at least 44 CSS-pixel touch targets, and the layout adapts to narrow screens and zoom.

## Setup

Requirements: Node.js 20 or newer. There are no npm runtime dependencies; ESLint and Prettier are development-only tools.

```sh
npm install
```

Optional Gemini setup: copy `.env.example` to `.env` and set `GEMINI_API_KEY` in that local file. Without a key, the server still starts and Explain more returns the stored explanation with a friendly note.

```sh
npm start
```

Open `http://127.0.0.1:3000`. The server binds to loopback by default; `PORT` can select another local port.

## Tests and quality checks

```sh
npm test
npm run test:coverage
npm run lint
npm run format
npm run format:check
```

The tests cover deterministic selection, scoring, streak boundaries, review intervals, corrupted storage, question-bank shape and Python outputs, server validation and security behavior, accessibility structure, unsafe DOM sinks, and palette contrast.

Coverage from `npm run test:coverage`: **98.12% lines, 83.42% branches, and 88.89% functions** across the modules loaded by the Node test suite. Browser-only modules are validated with the source-scan checks and browser flow rather than counted in Node's coverage report.
