# InSign — Claude Code Implementation Prompt (v2, supersedes docs/07)

Copy EVERYTHING between the two lines into a single Claude Code session. Do not run the prompt in pieces.

---

You are a senior frontend engineer + ML/AI integration engineer + accessibility engineer working on **InSign**, a real accessibility-technology product for a 24-hour university hackathon. You will turn the existing, already-polished InSign UI into a fully functional application. Work autonomously: inspect, plan, implement in phases, test after every phase with Playwright, and fix what you find before moving on. Never end a phase with failing typechecks, a broken build, or a visually broken page.

# 0. NON-NEGOTIABLE RULES (read first)

1. **Inspect the entire repository BEFORE writing anything.** Do not assume structure. Read every file listed in §1 and summarize your findings + plan back to the user before Phase 2.
2. **The existing UI is the product.** Preserve its typography, spacing, layout, themes, animations, and visual hierarchy exactly. You are wiring real functionality INTO this design, not re-skinning a template. If a change to the UI is unavoidable (e.g., a live-transcript panel), design it inside the existing token system so it is indistinguishable from the original design language.
3. **No fake functionality.** No random "AI" numbers, no fake recognition results, no recommendations that ignore real session history. Anything prototype-level must be labeled as such in the UI. Every displayed metric must come from real processing of real input.
4. **No paid runtime AI APIs.** No OpenAI, Anthropic, Gemini, DeepSeek, GLM, or any cloud LLM/AI service at runtime. Claude Code is your development agent only; the deployed app must not depend on it. All intelligence is local/browser-native.
5. **Playwright exclusively** for all browser/UI testing (see §14). No Selenium, Puppeteer, Cypress, or screenshot-only validation.
6. **Never expose secrets.** Only anon/public Supabase keys in frontend env. Provide `.env.example`; never commit `.env`.
7. **No medical claims anywhere** in copy: never "diagnose", "cure", "fix", "therapy", "accuracy of your stutter". InSign observes practice patterns; that is all. Say "practice patterns", "observed during practice".
8. Finish what you start: run the app, test it, inspect it, fix it, test again. Do not stop at "code written".

# 1. REPOSITORY INSPECTION (Phase 1 — modify nothing)

The repo currently contains a **finished, dependency-free static site** (no React/Vite/Supabase yet):

- `site/index.html` — the entire landing page: `<canvas id="bg">` signal background; fixed `<header id="nav">` (brand, SPEECH/SIGN/PHILOSOPHY links, `#theme-toggle` button, "Try InSign" CTA); sections with ids `#hero, #idea, #speech, #adaptation, #sign, #movement, #technology, #philosophy, #contact` plus `<footer>`. The Speech section (`#speech`) contains the scroll-driven story `#speech-story` (`.sflow` with `.sflow-spine`, five `.sflow-node` dots, five `.sflow-stage` rows; `#story-orb` mic, `#story-wave` SVG waveform, `#story-patterns` with four `.pattern` glyphs PACE/PAUSES/REPETITIONS/FILLERS, `#pattern-chip`, `#next-chip`). `#movement` contains the RAW→STABILIZED→RECOGNIZED canvas (`#mv-canvas`, `#mv-replay`, `#mv-result` with confidence bar `#mv-conf-fill`, `.mv-steps` rail). `#technology` has two pipeline cards (`.pipe` with `.pipe-node`/`.pipe-seg`). `#contact` has heading + `mailto:rehan.badar0103@gmail.com` link (17px, secondary — keep it that way).
- `site/css/style.css` — the complete design system as CSS custom properties on `:root` (dark default) and `[data-theme="light"]`. Key tokens: dark `--bg:#0A0A0B`, `--accent:#E8A33D`, `--text-primary:#F5F4F1`; light `--bg:#F3EFE6`, `--accent:#9C732C`, `--text-primary:#2B261E`; plus `--hairline`, `--surface-*`, `--accent-dim`, `--stage-fill`, `--chip-bg`, `--seg-dim`, radii `--r-md/lg/xl/full`, easings `--ease-out/--ease-soft`, duration `--t-theme:600ms` (theme crossfade), fonts Geist / Geist Mono / Instrument Serif (italic serif = accent words). HTML sets `data-theme` from `localStorage('insign-theme')` before paint. `html{scroll-padding-top:84px}` handles the fixed nav.
- `site/js/bg.js` — full-viewport canvas: ~10 thin flowing signal lines + traveler particles; colors read from `--signal-line`/`--signal-gold` RGB vars and crossfade on the custom `insign:theme` DOM event; fades with scroll; pauses on `visibilitychange`; static poster under `prefers-reduced-motion`.
- `site/js/main.js` — reveals (IntersectionObserver + scroll-pump fallback via `whenVisible`), theme toggle dispatching `insign:theme`, scroll-driven `.sflow` sequencer (spine fill, stage activation, waveform rAF), session timeline, RAW→STABILIZED→RECOGNIZED canvas with replay, pipeline signal loops, contact signal, parallax, magnetic CTAs.
- `site/server.js` + `site/start.bat` — zero-dependency Node static server, port 4173 with auto-increment fallback.
- `package.json` — only `start`/`dev` scripts running the static server. No build tooling yet.
- `docs/01–07` — design blueprint documents (design system, architecture, motion, data model, an earlier frontend-only prompt). Read `02-design-system.md` and `06-data-model-and-mock-data.md`; they are binding specs for tokens and schema shape.
- `insigntemp/`, `preview/` — scratch/preview artifacts; ignore unless asked.

Report back: inventory, what you will keep verbatim, migration plan, and any conflicts — THEN proceed.

# 2. TARGET STACK & MIGRATION (Phase 2)

Migrate the static site into **Vite + React 18 + TypeScript** at the repo root **without visual regression**:

- Vite app with `index.html` at root; move the static page into `src/` as components (structure below). The zero-dep `site/` folder may remain for reference but the Vite dev server becomes the primary app (`npm run dev`, port 5173) and `npm run build && npm run preview` the production path (Vercel-compatible: static SPA output).
- Dependencies: `react`, `react-dom`, `react-router-dom`, `@supabase/supabase-js`, `@mediapipe/tasks-vision`. Dev: `typescript`, `@vitejs/plugin-react`, `@playwright/test`, `vitest` (unit tests for pure modules). Nothing else without justification.
- **Port the design system, do not rewrite it:** keep `style.css` as the single stylesheet (import once in `main.tsx`). Keep every token, keyframe, and the `.rv`/`.mask` reveal classes. Components use these classes; do not introduce Tailwind, shadcn defaults, CSS-in-JS, or any second styling system.
- Theme: port the pre-paint localStorage logic into `index.html`, and the toggle into a `ThemeProvider` that still dispatches `insign:theme` (the background canvas depends on it). Theme transitions keep the 600ms crossfade.
- **Background**: keep `bg.js` logic as a `useSignalBackground()` hook + `<SignalBackground/>` component mounted only on the landing page (never inside the app/dashboard routes). Preserve: line count by breakpoint, scroll fade, visibility pause, reduced-motion poster, theme crossfade.
- **Landing animations**: keep the scroll-driven `.sflow` sequencer, movement canvas, pipelines, and reveals working identically after componentization. These are acceptance-tested in §14.

Project structure (adjust only if the repo argues for better):

```
src/
  main.tsx, App.tsx, index.css        // re-export of the design stylesheet
  styles/style.css                    // the existing stylesheet, untouched tokens
  components/                         // shared: Button, Badge, Panel, Overline, ThemeToggle, Nav, Footer
  pages/                              // Landing, Auth (SignIn/SignUp), Dashboard, SpeechPractice, SpeechHistory, SignTranslate, Settings
  features/
    speech/                           // SpeechPractice UI, ScenarioPicker, LiveTranscript, MetricTiles, PatternPanel
    sign/                             // SignCamera, LandmarkOverlay, SignResult, ConfidenceMeter, VocabularyBadge
  services/                           // supabaseClient.ts, authService.ts, sessionService.ts, personalizationEngine.ts, contextEngine.ts
  lib/speech/                         // useSpeechRecognition.ts, metrics.ts, fillers.ts
  lib/sign/                           // useCamera.ts, useHandLandmarker.ts, kalman.ts, normalizer.ts, featureWindow.ts, classifier.ts, classifierTemplates.ts
  hooks/                              // useTheme, useMediaPermission, useRafLoop, useUnmountCleanup
  types/
  workers/                            // optional: classifier worker
```

# 3. DESIGN PRESERVATION CONTRACT

- Landing page: all 9 chapters, hero, `.sflow` story, movement demo, pipelines, philosophy, contact, footer remain and must still pass the visual checks in §14. The static page's content is the source of truth — port copy verbatim (including "DEMO DATA" badges where they exist; once a feature is REAL, remove its demo badge; anything still prototype stays badged).
- App shell (post-login) reuses the same tokens: near-black `--bg`, hairline borders, mono overlines, `--surface-2` cards, 20px `--r-xl` panels, one accent. App pages must feel like the same product — calmer (no signal background), generous whitespace, no dashboard clutter.
- Light mode is its own system (warm ivory `#F3EFE6`, champagne `#9C732C`) — never invert. Test every new component in both themes.
- Contact: heading "Let's make technology more accessible." large; email `rehan.badar0103@gmail.com` ~17px, `mailto:`, hover underline. Never a giant email heading. No contact form.

# 4. AUTHENTICATION & DATA (Phase 3)

**Supabase client** (`services/supabaseClient.ts`): create from `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (public values only). Fail loudly-but-gracefully at startup if missing: app renders landing page fine, app routes show "Setup required" with pointer to `.env.example`.

**Schema** (SQL migration files committed under `supabase/migrations/`):

```sql
profiles (id uuid PK references auth.users, display_name text, created_at timestamptz)
user_preferences (user_id uuid PK, store_transcripts boolean default true, filler_words text[] default array['um','uh','like','you know','actually','basically'], sign_confidence_threshold numeric default 0.75, theme text)
speech_sessions (id uuid PK default gen_random_uuid(), user_id uuid, scenario text check in ('interview','presentation','phone_call','introduction','conversation','custom'), transcript text, duration_ms int, words_per_minute numeric, pause_count int, repetition_count int, filler_count int, created_at timestamptz default now())
speech_patterns (id uuid PK, user_id uuid, pattern_key text,        -- e.g. 'longer_pauses'
  scenario text, confidence numeric, evidence jsonb, first_seen timestamptz, last_seen timestamptz, occurrence_count int)
practice_recommendations (id uuid PK, user_id uuid, source_pattern_id uuid references speech_patterns, recommendation text, scenario text, status text default 'open', created_at timestamptz)
sign_sessions (id uuid PK, user_id uuid, recognized_signs jsonb,    -- [{sign, confidence, at_ms}]
  duration_ms int, created_at timestamptz)
```

**RLS on every table**: `auth.uid() = user_id` for SELECT/INSERT/UPDATE/DELETE. Enable RLS before any data query is written. Auto-create `profiles` + `user_preferences` on signup via trigger. No service-role key anywhere in the frontend.

**Auth** (`services/authService.ts`, pages `/auth/signin`, `/auth/signup`): email+password sign-up, sign-in, sign-out, session persistence, password reset stub. UI built in the existing design language (mono labels, hairline inputs, focus-visible amber ring). The landing "Try InSign" CTA routes to `/auth/signup` (signed-in users go to `/dashboard`). Protected routes via a `RequireAuth` wrapper redirecting to `/auth/signin?next=…`. Form errors inline, specific, and calm ("That password needs at least 6 characters"), never alert().

**Persistence note:** if Supabase env vars are absent (local dev before setup), fall back to an explicit, clearly-labeled "local demo mode" using IndexedDB/localStorage behind the same `sessionService` interface — the UI must always disclose which mode is active. The Supabase path is the real path; do not let the fallback silently become the demo.

# 5. SPEECH COMPANION (Phases 4–5)

**Pipeline:** MIC → Web Speech API → live transcript → local analysis → session metrics → storage → pattern detection → recommendation.

**Recognition** (`lib/speech/useSpeechRecognition.ts`): wrap `webkitSpeechRecognition`/`SpeechRecognition`. continuous + interim results; maintain final transcript and interim hypothesis; expose state machine `idle → requesting_permission → listening → error | stopped`. Auto-restart on the API's spurious `end` events while the user intends to listen. Guard `no-speech`, `aborted`, `network`, and `not-allowed` errors. If unsupported (Firefox/Safari): disable practice start with a clear in-design notice ("Live speech recognition needs Chrome or Edge — your transcript can be typed manually instead") and offer a manual transcript textarea so the rest of the pipeline still works. Be honest in UI copy: a "How speech is processed" disclosure states that browser speech recognition may send audio to the browser vendor's service, while pattern analysis (metrics, repetition/filler detection, personalization) runs locally in the app, and nothing is stored unless saving is confirmed and `store_transcripts` is on. Never claim "fully local".

**Metrics** (`lib/speech/metrics.ts` — pure, unit-tested functions):
- `wordsPerMinute(finalTranscript, activeSpeechMs)` — words / active speaking time (exclude recognized pauses from the denominator where the API's timing allows).
- `countPauses(speechEvents)` — gaps between recognition result events above a configurable threshold (default 800ms).
- `countRepetitions(tokens)` — immediate repeats of words/short bigrams ("I I I", "can can can you") using case/punctuation-insensitive tokenization; report count + the repeated token.
- `countFillers(tokens, list)` — against `user_preferences.filler_words` (editable in Settings).
- Duration via `performance.now()` bracketing the session.

**Practice flow** (`/app/speech`): scenario picker (six scenarios, styled as the landing's mono-caption pattern) → practice screen: mic orb (reuse `#story-orb` visual, `live` pulse while listening), live transcript area (final text in `--text-primary`, interim in `--text-tertiary`, auto-scroll, readable font size), timer, Start/Stop/Cancel, and four metric tiles appearing as data arrives — PACE (wpm), PAUSES (count + timeline ticks), REPETITIONS, FILLERS. These are observations, not scores: no bars implying judgment, no grading language. On stop → review screen summarizing metrics + transcript → explicit Save (respect `store_transcripts`; when off, save metrics with transcript redacted and say so) → redirect to history with the new recommendation shown.

**Personalization** (`services/personalizationEngine.ts` — pure, unit-tested, deterministic):
- Input: the user's stored sessions. Output: `{ pattern: string|null, scenario: string|null, confidence: number, recommendation: string, rationale: string }`.
- Rules (tuneable constants at module top): require ≥3 sessions of the same scenario within the last 14 days before claiming any pattern; `pattern: 'longer_pauses'` when median pause count of the scenario's recent sessions ≥ 1.3× the user's cross-scenario median AND trending flat/up; `'slowing_pace'` when median wpm declines ≥10% across ≥3 same-scenario sessions; `'frequent_repetitions'` when repetition rate per 100 words ≥ 2× other scenarios; `'filler_heavy'` analogously. Confidence = simple evidence-based score (0.5–0.9) from sample size and effect size — never a fake decimal with false precision.
- Recommendation text templates reference the actual numbers ("Your last 3 interview sessions averaged 14 pauses — the most of any scenario. Try another interview round focused on response pacing.").
- With insufficient history return `{ pattern: null, recommendation: "Complete a few more sessions to uncover your communication patterns." }` — the UI renders this state honestly.
- Persist detected patterns to `speech_patterns` (update `occurrence_count`/`last_seen` on recurrence) and the current open recommendation to `practice_recommendations`. Dashboard shows the open recommendation as "NEXT PRACTICE".
- Never present patterns as diagnosis; copy stays in practice-language. Include the one-line evidence always ("based on your last N sessions").

# 6. SIGN TRANSLATOR (Phases 6–9)

**Pipeline:** CAMERA → MediaPipe Hand Landmarker → 21 landmarks → normalization → 1D Kalman → temporal window → classifier → top-k → confidence gate → context engine → text.

**Camera** (`lib/sign/useCamera.ts`): getUserMedia video (1280×720 ideal), permission-pending / denied / no-device / busy states with recovery instructions; request only when the user presses "Enable camera" (never on page load); **stop every track on unmount/route-leave** (verified in §14).

**Landmarks** (`lib/sign/useHandLandmarker.ts`): `@mediapipe/tasks-vision` HandLandmarker, `runningMode:"VIDEO"`, GPU delegate with CPU fallback, model served from `/public/models/` (download the asset at build-prep time; if the asset can't be bundled, lazy-load from the official CDN and surface a clear offline warning). Run inference inside a rAF loop at ≤30fps; keep video frames and landmark arrays in refs — never per-frame React state. Handle: no hand (state chip "No hand in view"), one hand (primary), two hands (process the dominant/most central; chip "Two hands — tracking the closest").

**Normalization** (`lib/sign/normalizer.ts`): translate relative to wrist (landmark 0), scale by reference hand dimension (wrist→middle-finger-MCP distance), optional rotation alignment to the wrist→MCP axis; output unit-space coords. Pure + unit-tested.

**Kalman smoothing** (`lib/sign/kalman.ts`): a 1D constant-velocity Kalman filter class (predict/update, tunable process/measurement noise, one instance per coordinate stream: 21×3) and a `LandmarkSmoother` wrapper that also exposes the *unsmoothed* values — the UI draws RAW (dim, jittery) and STABILIZED (amber, smooth) overlays simultaneously so the filtering is visible, exactly like the landing demo. Pure + unit-tested (feed a noisy sine; assert variance reduction and lag bounds).

**Temporal window + classifier** (`lib/sign/featureWindow.ts`, `classifier.ts`, `classifierTemplates.ts`): rolling window (~1.2s) of smoothed, normalized landmark frames. Define the interface now:

```ts
interface SignClassifier { classify(window: LandmarkFrame[]): Promise<Classification[]>;
  // Classification: { sign: SignId; confidence: number } sorted desc, top-k (k=3)
}
```

Implement `TemplateMatcherClassifier` honestly for the hackathon vocabulary — `HELLO, THANK_YOU, YES, NO, HELP, PLEASE, SORRY, GOOD` — using deterministic template matching: for each vocab sign, hand-authored keyframes/trajectory templates in normalized space (e.g., HELLO: open palm, lateral wave — dominant wrist x oscillation with fingers extended; THANK_YOU: fingertips from chin forward+down; YES: fist oscillation; NO: index+middle closing; HELP: fist with thumb up, slight radial motion; PLEASE: flat palm circular motion; SORRY: fist circular over chest; GOOD: flat hand from chin forward). Score = per-frame static-pose similarity (fingerprint of finger extensions/curl from normalized landmarks) combined with trajectory correlation over the window, using DTW or banded correlation; confidences are softmax-normalized similarities. The UI carries a persistent "Limited prototype vocabulary: 8 signs" badge listing them — no universal-translation claims anywhere. If templates prove unreliable for a sign at test time, drop that sign and say so in the docs rather than shipping fake detections. The interface makes a trained model swap a one-file change later.

**Confidence gate** (threshold from `user_preferences.sign_confidence_threshold`, default 0.75): above → emit sign to the output strip; 0.55–threshold → show the top candidate ghosted with "Possible: THANK YOU? — hold the sign to confirm"; below → state chip "Movement unclear — try again". Never fabricate a confident label. Debounce repeats (same sign within 1.5s doesn't double-fire) and require the sign to hold stable for ~400ms before emitting.

**Context engine** (`services/contextEngine.ts` — deterministic, local, no LLM): input = emitted sign sequence + last candidates + confidences; output = the displayed interpretation. Rules: prefer the highest-confidence candidate; when the top-2 are within 0.08 confidence for 3 consecutive windows, prefer the candidate that forms a common sequence with prior emitted signs (small hand-authored bigram table, e.g. HELLO→THANK_YOU, PLEASE→THANK_YOU) and mark it "context-adjusted"; when nothing clears the gate, say so — the engine never invents a sign that wasn't a candidate. Output drives a sentence strip ("HELLO → THANK YOU") with each token's confidence on tap/hover.

**Sign UI** (`/app/sign`): camera stage styled like the landing's movement demo (hairline grid, `--stage-fill` surface); landmark overlay canvas drawing raw (dim, jittery) vs stabilized (amber) simultaneously — the product's signature visual; state chips (tracking/no hand/low confidence); result strip; confidence meter; "Clear" and vocabulary badge. Sign sessions save on session end (recognized signs + confidences + duration; no video ever stored or uploaded).

**Performance:** rAF-gated inference ≤30fps; overlay canvas work batched in the same rAF; all heavy loops prefer typed arrays; pause the whole loop when the tab is hidden (`visibilitychange`) or the route unmounts; no per-frame setState (state updates only on sign emission / state-chip change). Validate smoothness in the Playwright run on a normal laptop.

# 7. DASHBOARD & APP SHELL

`/dashboard` after login: "Welcome back, {name}"; two feature panels (Speech Companion / Sign Translator) in the existing card language; "Your progress" — recent sessions (from `speech_sessions`/`sign_sessions`), the open "NEXT PRACTICE" recommendation from the personalization engine, and a simple activity strip (per-week counts — one idea, no dense charts). `/app/speech/history` lists sessions with scenario chips and metrics; a session row click opens its detail (transcript if consented). `/settings`: display name, store_transcripts toggle, editable filler list, sign confidence slider, theme. Empty states everywhere ("No sessions yet — your first practice will appear here").

# 8. ERROR HANDLING MATRIX (implement every row; all copy in-design, calm, actionable)

Mic denied → explain why mic is needed + how to re-enable in browser settings, offer manual transcript mode. Camera denied → same pattern with "Retry" re-prompt. Web Speech unavailable → Chrome/Edge notice + manual mode. Recognition stops unexpectedly → auto-restart with visible "reconnected" chip; repeated failure → stop with clear message. No speech detected in 15s → gentle prompt, keep listening. Empty transcript on save → inline validation. No hand → tracking chip; MediaPipe init failure → CPU fallback then clear error; classifier throws → error boundary isolates the sign feature, camera stops, app shell survives. Supabase unreachable → offline banner, queue session saves locally and retry on reconnect; auth expired → redirect to sign-in preserving `next`. Low confidence → "Movement unclear" state. Unsupported browser → feature-specific notices, never a dead screen. Add a top-level React error boundary that renders the landing design language with "Something went wrong — reload" + report email.

# 9. ACCESSIBILITY

Semantic landmarks (`header/nav/main/footer`), one `h1` per page, logical heading order. Full keyboard support (nav, scenario picker, Start/Stop, camera enable, replay) with visible `:focus-visible` rings (already in the stylesheet — keep them). Live regions: transcript container `aria-live="polite"` (final text only, debounced); sign output `role="status"`; state chips announced. All interactive elements real `<button>/<a>` with labels; icon-only buttons get `aria-label`. Contrast: verify both themes ≥4.5:1 body, ≥3:1 large text (amber on ivory especially — darken to `--accent` light value if needed). Permission prompts preceded by in-page explanation of why. Respect `prefers-reduced-motion` for all new UI (static equivalents already exist for the landing). Caption alternatives for all visualizations (the story sections must make sense via text alternatives). Test with keyboard-only navigation and a screen-reader smoke pass (headings, labels, status announcements).

# 10. SECURITY & ENV

`.env.example`: `VITE_SUPABASE_URL=`, `VITE_SUPABASE_ANON_KEY=` with comments ("public anon key only — never the service-role key"). Runtime guard rejects keys prefixed `service_role`. No secrets in code or Vite-embedded output; add a grep check to the build script. Docs list every env var and where to get it.

# 11. DOCS (update, don't skip)

`README.md`: what InSign is (two products, philosophy), quickstart (env setup, `npm run dev`), scripts, permissions the app requests and why, honest limitations (8-sign vocabulary, template-matching classifier, Web Speech browser variance). `docs/architecture.md`: module map + data flow diagrams for both pipelines. `docs/database.md`: schema + RLS rationale. `docs/testing.md`: Playwright workflow. `docs/classifier.md`: vocabulary, template format, confidence math, exactly how to swap in a trained model. Keep every claim technically accurate — this is a real product, and the docs are read by judges.

# 12. PHASED EXECUTION (gate each phase: `tsc --noEmit` clean, `npm run build` passes, Playwright spot-check of affected flows, then report)

P1 inspect+report (§1) → P2 Vite/React/TS migration with zero visual regression (landing Playwright suite green before continuing) → P3 Supabase+auth+RLS+dashboard shell → P4 speech recognition+metrics+practice flow → P5 personalization+history+settings → P6 camera+MediaPipe+overlay → P7 normalization+Kalman+RAW/STABILIZED overlay → P8 classifier+confidence+context+result strip → P9 error matrix+accessibility+performance pass → P10 full Playwright suite + screenshots + fixes → P11 docs + final polish. Commit per phase with clear messages (ask before pushing).

# 13. ACCEPTANCE CHECKLIST (all must be true)

Landing design remains recognizable in both themes; auth works end-to-end; RLS enforced; speech session produces real locally-computed metrics and persists; history ≥3 same-scenario sessions produces a data-derived recommendation (and honestly refuses with <3); camera + MediaPipe run at ≤30fps with visible RAW vs STABILIZED difference; 8-sign template classifier emits gated by confidence with "Movement unclear" below threshold; context engine never invents signs; every §8 error state demonstrable; camera/mic streams verified released on unmount; no paid AI APIs; no secrets; responsive at 1920/1440/1366/768/390; contact email ~17px + mailto; Playwright suite passes headless; no console errors; production build succeeds and previews correctly.

# 14. PLAYWRIGHT (exclusive browser/UI testing tool)

Install `@playwright/test` + Chromium. `playwright.config.ts`: baseURL `http://localhost:5173`, `webServer: { command: 'npm run dev', reuseExistingServer: true }`, projects for viewports **1920×1080, 1440×900, 1366×768, 768×1024, 390×844**. Auth tests use a dedicated test user against local Supabase or the labeled local-demo mode; camera/mic tests use Playwright's `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream` launch flags and fake video stream where possible; where automation can't drive real recognition, test the state machine via UI-observable states (permission denied via `--deny-permission-prompts`, unsupported-mode, manual transcript) — never mock the UI into lying.

`tests/e2e/landing.spec.ts`: page loads; nav SPEECH/SIGN/PHILOSOPHY/CONTACT anchors scroll (assert section top clears the 84px nav); Try InSign → auth; theme toggle flips `data-theme` + persists after reload + background crossfades (dispatch check); no horizontal overflow at any viewport; hero + `.sflow` + movement canvas + pipelines render (canvas has non-zero pixels); contact `mailto` href correct + font-size ≤20px; footer links work; zero console errors (fail test on any); no failed non-font network requests.

`tests/e2e/speech.spec.ts`: protected route redirects; sign-in; scenario select; Start → listening state + mic orb active; manual-transcript mode produces metrics (WPM/pauses/repetitions/fillers computed from typed text with known expected values — assert exact numbers); Stop → review; Save → appears in history; seed 3 interview sessions → dashboard shows the data-derived recommendation (assert the pattern logic output matches `personalizationEngine` unit-test fixture); <3 sessions → honest "complete a few more sessions" state; store_transcripts off → transcript redacted in DB/history.

`tests/e2e/sign.spec.ts`: enable camera (fake device) → video element playing + landmark overlay canvas updates + tracking chip; unmount/route-leave → all tracks `ended` (assert via page evaluation of `mediaDevices.enumerateDevices`/track state or exposed cleanup hook); permission denied → recovery UI, no crash; no-hand state chip (fake video of empty scene if needed, else force via handle); low-confidence path → "Movement unclear" (expose a test hook to feed recorded landmark frames); emitted sign appears in strip with confidence; Clear works.

`tests/e2e/accessibility.spec.ts`: keyboard-only nav reaches every interactive element with visible focus; live regions exist; contrast assertion helper on key text in both themes.

`tests/unit/*.test.ts` (Vitest): kalman variance-reduction, normalizer invariants (wrist-zeroed, unit-scaled), metrics exactness on fixtures, personalizationEngine decision table (≥3 sessions/no history/boundary confidence), contextEngine bigram + no-hallucination cases.

**Visual QA loop:** after the suite is green, take full-page screenshots at all 5 viewports × both themes (`tests/screenshots/`), actually inspect them, and fix: navbar overlap, clipped text, broken animations, unexpected scrollbars, poor mobile layout, dashboard clutter, wrong colors/typography. Fix → re-run → repeat until stable. Also verify `npm run build && npm run preview` serves the final app cleanly.

# 15. FINAL WORD

The judge's 10-second experience: landing page (keep it exactly as polished as it is now) → Try InSign → dashboard → one real speech practice with real metrics and a real, history-derived recommendation → one real sign session where the RAW→STABILIZED difference is visible and a sign appears only when earned. Sophisticated underneath, simple on top, honest everywhere, smooth throughout. If a shortcut would make the demo lie, take the longer honest road.

---
