IMPORTANT — GITHUB:
DO NOT make any changes to GitHub during this task.

- Do NOT commit.
- Do NOT push.
- Do NOT create branches.
- Do NOT create pull requests.
- Do NOT modify GitHub remotely.
- Do NOT rewrite Git history.
- Do NOT run git push.

Work ONLY on the local repository.
We will review and commit/push the changes manually later.

==================================================
SCOPE — SPEECH COMPANION ONLY
==================================================

You are working on the InSign repository, an accessibility platform with two
products. This task touches ONLY the Speech Companion and UI directly related
to it.

Do NOT modify, in any way:

- Sign Translator (pages, components, services, types)
- MediaPipe integration
- Kalman filter / landmark smoothing / sign classifier / camera hooks
- The landing page (site/ marketing pages, background animations)
- Dashboard functionality that is not Speech-related
- Supabase schema, migrations, or client architecture — EXCEPT the minimal
  additive changes explicitly allowed in the PERSONALIZATION STORAGE section
- package.json dependencies, EXCEPT none should be needed
- The test runner configuration, EXCEPT adding test files
- CI/GitHub Actions files

If you believe an out-of-scope file must change to fix a Speech bug, STOP and
explain why in your final report instead of changing it.

==================================================
STEP 0 — INSPECT THE REPOSITORY BEFORE CHANGING ANYTHING
==================================================

Do not assume the structure. Read first, then edit. The file map below was
verified when this prompt was written; re-verify every path before relying on
it, and report anything that has drifted.

Expected relevant files:

- src/lib/speech/metrics.ts        — tokenization, filler/repetition matching,
                                     pause derivation from recognition events,
                                     WPM from speech-active windows
- src/lib/speech/useSpeechRecognition.ts — the recognition hook: manual restart
                                     loop (restartTimerRef/restartDelayRef),
                                     startedAtRef, interim handling
                                     (commitInterimRef), a stop() that waits up
                                     to ~500ms (forceEndTimerRef) for a trailing
                                     final result, suppressNextResultRef
- src/pages/SpeechPractice.tsx     — scenario select, mode banner, Type
                                     Transcript mode, live metrics, results
                                     screen, recomputeDerived()
- src/features/speech/MetricTiles.tsx — WPM/PAUSES/REPETITIONS/FILLERS tiles
- src/components/ModeBanner.tsx    — renders "PLACEHOLDER PIPELINES · REAL
                                     PROCESSING ARRIVES WITH THE BUILD" and
                                     "LOCAL DEMO MODE · ACCOUNTS LIVE IN THIS
                                     BROWSER ONLY" banners
- src/services/personalizationEngine.ts — deterministic engine: needs ≥3
                                     same-scenario sessions, averages recent
                                     sessions, honest "Complete a few more
                                     sessions" fallback
- src/services/sessionService.ts   — session persistence; transparent local
                                     demo store (localStorage keys
                                     insign.local.*) when Supabase env vars
                                     are absent
- src/types/index.ts               — SpeechSession and related types
- Settings: a user-editable filler-words list (settings page testid
  filler-words) and store-transcripts toggle
- tests/unit/speechTiming.test.ts, tests/unit/metrics.test.ts — existing unit
  tests for timing/metrics
- tests/e2e/speech.spec.ts, tests/e2e/helpers.ts — Playwright suite. IMPORTANT:
  four tests drive sessions through the Type-Transcript path ("type my
  transcript", testids manual-transcript, manual-seconds, begin-session,
  stop-session, save-session, review-transcript, metric-*), and one asserts
  LOCAL DEMO MODE is always visible. These tests must be migrated, not deleted
  (see TESTING).
- tests/e2e/helpers.ts             — signUp(), seedSpeechSessions() (seeds
  insign.local.speech_sessions rows with id/user_id/created_at/scenario/
  transcript/duration_ms/words_per_minute/pause_count/repetition_count/
  filler_count), trackConsoleErrors(), uniqueEmail()

Also read: package.json scripts (unit-test and e2e commands), the router setup,
the settings service, and the dashboard's use of the personalization engine.

PHASE 1 DELIVERABLE: before editing, output a short inspection report:
the actual recognition lifecycle (start → events → restart → stop), where
session start/end timestamps live, where metrics are computed and when, where
the results screen is rendered, how sessions persist in both Supabase and
local-demo modes, and the exact current pause/filler/repetition algorithms.
Then proceed. If reality differs materially from this prompt, adapt to the
code, not the prompt — and say so in the final report.

==================================================
BUG 1 — ABSURD WPM (e.g. 54000) — FIX THE ROOT CAUSE
==================================================

Symptom: WPM sometimes shows impossible values like 54000.

Hunt the root cause across the full timing architecture. Trace every one of:

- session start timestamp (where is it set? is it reset on recognition restart?)
- session end timestamp (where is it set? Stop button? recognition end? both?)
- elapsed duration used by the WPM formula
- SpeechRecognition event flow: onresult interim vs final, onspeechstart,
  onspeechend, onend, onerror
- automatic restart behavior (the hook restarts recognition after a short
  delay so long sessions survive Chrome's ~60s auto-stop)
- the Stop path: stop() schedules a ~500ms force-end timer; a final result can
  arrive just before, with, or after that timer — audit all three orderings,
  including suppressNextResultRef swallowing a legitimate final result
- word counting: are interim results counted? are words double-counted when a
  final result repeats interim text already counted?
- duration calculation: ms vs seconds vs minutes conversions; division by a
  near-zero elapsed; using a stale startedAt; counting only speech-active
  windows vs wall-clock

Correct conceptual calculation:

  WPM = word_count / elapsed_minutes

where elapsed_minutes is the ACTUAL practice session duration (from the
original session start — NOT from the last recognition restart — to the moment
Stop finalizes). The final number must be mathematically explainable from
(word count, actual duration) alone.

Hard requirements:

- never divide by zero; treat elapsed < ~1000ms as "no session" or use the
  smallest defensible floor ONLY where a session genuinely exists
- never use stale timestamps; one authoritative session clock owned by the
  hook, started once at Begin, stopped once at finalize
- automatic recognition restarts must NOT reset or distort the session timer
  and must NOT inflate WPM
- Stop must correctly finalize: include a final recognition result that
  arrives around Stop (the ~500ms grace window) in BOTH word count and
  duration; never finalize twice; never append a late result to an already
  finalized session
- interim results must not inflate word count; prefer finalized transcript
  segments for counting
- short sessions (10–30s) must remain sane; a 20-word, 20-second session is
  60 WPM — nothing more
- long pauses must not cause absurd WPM (wall-clock duration includes
  silence; that is correct — do not "fix" it by excluding pause time, but the
  number must be explainable)
- empty sessions (zero words) must be handled safely — WPM 0 or "—", never
  NaN/Infinity

FORBIDDEN: hiding the bug with Math.min(wpm, 200) or any arbitrary clamp on
the displayed value. A plausibility check is allowed ONLY as a dev-time
diagnostic (console.warn when computed WPM exceeds ~350) — it must never
silently alter stored or displayed values. Fix the timing; do not mask it.

Audit the existing ~500ms force-end race specifically: if Stop fires while
recognition is mid-utterance, the current design may (a) drop the trailing
final result, or (b) attribute its words to a window longer/shorter than
reality. Restructure so finalize happens exactly once, after either the final
result arrives or the grace window expires — whichever first — and elapsed
time is captured at that single moment.

==================================================
WPM REGRESSION TESTS (unit, extend tests/unit/speechTiming.test.ts)
==================================================

Add tests for a pure timing/metrics function (extract one if the logic is
currently buried in the hook or component) covering:

1. zero words → 0 WPM, no NaN
2. zero duration → safe, no division by zero
3. near-zero duration (1–50ms) → safe, sane
4. normal 10–30s session → exact expected WPM
5. longer session (several minutes) → exact expected WPM
6. long pause inside a session → duration includes the pause, WPM stays sane
7. recognition restart mid-session → total duration spans the FULL session,
   WPM unchanged by the restart
8. multiple restarts → same invariant
9. Stop immediately after speaking → trailing words counted, duration
   correct to the Stop moment
10. Stop after silence → duration includes trailing silence
11. final recognition result arriving around Stop (before/at/after the grace
    timer) → counted exactly once, session finalized once

These tests must make it impossible for a regression to silently bring back
the 54000 WPM bug.

==================================================
BUG 2 — PAUSE DETECTION (≥800ms) — FIX THE ROOT CAUSE
==================================================

Symptom: pauses are frequently missed.

First, inspect the current algorithm. Known weaknesses to verify in the
actual code (adapt if it has drifted):

- pauses are derived only from gaps BETWEEN finalized recognition results,
  so the trailing silence between the last final result and Stop is never
  counted — a user who stops speaking 5 seconds before pressing Stop gets 0
  pauses for a 5-second pause
- a recognition restart gap (onend → scheduled restart → onstart) can be
  mistaken for a speech pause — it must never be
- interim-result timing is noisy and must not create pauses

Implement pause detection on the best meaningful signal available, in this
preference order:

1. Speech events that indicate real speech activity (onspeechstart /
   onspeechend, or final-result arrival times used as speech-activity
   proxies, or — if already present — an audio-level voice-activity signal)
   to build speech segments; a pause is a gap BETWEEN segments.
2. If only final-result timestamps exist, use gaps between them, PLUS the
   trailing gap from the last speech activity to session finalize, and
   EXCLUDE restart gaps (you know exactly when you scheduled a restart —
   subtract that window).

Hard requirements:

- one single named constant, e.g. PAUSE_THRESHOLD_MS = 800, in one place
- gap < 800ms → not a pause; gap ≥ 800ms → pause
- session start silence does NOT count as a pause
- session end silence DOES count only if ≥ threshold (trailing-silence fix)
- restart gaps never count as pauses
- no double counting (a gap counted once, from exactly two segment edges)
- prefer finalized speech over unstable interim results
- do not fabricate precision: if the browser gives you coarse timing, the
  count is approximate by nature — that is acceptable; silently inventing
  0.1s-precision is not
- the pause count MUST actually change when a user speaks with meaningful
  silence between segments (that is the bug)

PAUSE DISPLAY (results screen):
- always show the pause count (existing metric-pauses tile)
- if the architecture records pause segments, also show total pause duration
- if (and only if) segment start/end data actually exists, render a very
  simple horizontal speech/pause timeline: one row, speech blocks and short
  gaps, with the longest pause annotated (e.g. "1.2s pause"). If the data
  does not support locations, show the count only — no fake timeline.

==================================================
BUG 3 — FILLER WORD DETECTION — FIX THE ROOT CAUSE
==================================================

Inspect the existing implementation (tokenizer + multi-word phrase matcher in
metrics.ts). Fix whatever makes it unreliable. Required defaults must include
ALL of:

  um, uh, hmm, like, basically, actually, you know, sort of, kind of, I mean

Rules:

- case-insensitive; punctuation-tolerant ("Um, I think..." → detects "um")
- multi-word fillers matched as phrases ("You know, I worked on..." →
  detects "you know")
- proper tokenization — NO substring matching: "umbrella" MUST NOT count as
  "um"; "basically" MUST NOT count as "like"
- match against the finalized transcript (the existing architecture prefers
  finalized segments — keep that)
- do not overcount legitimate uses: match whole words/phrases only
- preserve the existing user-editable filler list in Settings (testid
  filler-words) as an OVERRIDE/EXTENSION of the defaults; the e2e test "a
  custom filler list changes what is counted" must keep passing in spirit
- expose filler count; expose filler rate (per minute or per 100 words) in
  the data layer if useful — display may stay minimal

==================================================
BUG 4 — REPETITION DETECTION — VERIFY AND HARDEN
==================================================

Inspect the existing repetition detection (bigram-based in metrics.ts).
It should detect immediate repeated words or short repeated phrases:

  "I I worked on robotics."       → 1 repetition
  "I wanted to to explain..."     → 1 repetition

Harden so matching is robust to:

- capitalization ("I I" vs "I i")
- punctuation ("think... think" / "go, go")

Avoid false positives (legitimately repeated articles across a pause are
still immediate repeats — that is correct; but do not count a word repeated
far apart in the transcript). Reuse the existing architecture; extend it only
where needed. Add unit tests for: repeated word, repeated phrase
("you know you know"), punctuation between repeats, capitalization, and
non-repeating control text.

==================================================
REMOVE "TYPE TRANSCRIPT" FROM THE UI
==================================================

- Remove the visible "Type my transcript" mode from SpeechPractice.tsx,
  including the manual-transcript and manual-seconds inputs. The product is
  microphone-first: Scenario → Start Practice → Listen → Speak → Stop →
  Analysis → Personalized feedback → Drill → Practice Again.
- Do NOT delete internal analysis functions that Type Transcript exercised
  (metrics computation from a transcript + duration is still used by tests
  and possibly the drill preview) — keep them importable.
- Migrate the four e2e tests that currently drive the Type-Transcript path
  to a controllable SpeechRecognition mock (see TESTING). No user-facing
  typing path may remain.
- Keep the inline refusal when a session has nothing to save ("nothing to
  save yet") — that behavior is tested and correct.

==================================================
REMOVE UNNECESSARY PROTOTYPE TEXT
==================================================

Remove these visible UI strings entirely (ModeBanner.tsx and anywhere else
they appear):

- "PLACEHOLDER PIPELINES · REAL PROCESSING ARRIVES WITH THE BUILD"
- any "Hackathon Prototype Status: ... 24H Hackathon Prototype" block

Do NOT replace them with another giant explanatory block. The honest privacy
disclosure ("browser vendor's recognition service may receive audio / pattern
analysis runs locally") is DIFFERENT — keep it, it is required and tested.

==================================================
LOCAL DEMO MODE — HIDE WHEN SUPABASE IS CONFIGURED
==================================================

- Find how Supabase configuration is detected (env vars VITE_SUPABASE_URL /
  VITE_SUPABASE_ANON_KEY or an existing isSupabaseConfigured helper).
- The "LOCAL DEMO MODE · ACCOUNTS LIVE IN THIS BROWSER ONLY" banner must
  appear ONLY when Supabase is genuinely not configured. When configured, it
  must not render at all.
- Keep the local fallback mechanism itself intact (it powers tests and
  offline dev).
- Remove any visible "VITE_SUPABASE_URL ... not set" instruction text from
  the product UI; move developer guidance to a comment or README if needed.
- Update the e2e test "the persistence mode is always disclosed" to assert
  the banner's visibility MATCHES the actual configuration flag in the test
  environment (which is unconfigured → visible), not unconditional presence.

==================================================
RECORDING EXPERIENCE — CALM, RESPONSIVE, OBVIOUS
==================================================

Clearly distinguish four states in the practice screen: IDLE, LISTENING,
PROCESSING (after Stop, while the grace window resolves), RESULTS.

When LISTENING:

- show a subtle, smooth indicator that communicates "your voice is being
  captured": a gently pulsing mic mark and/or a calm level meter
- PREFERRED: react to actual speech activity via a lightweight
  AudioContext AnalyserNode on its own getUserMedia({audio:true}) stream,
  capability-checked, with complete teardown on stop/unmount. If that is
  not practical, a state-driven pulse is acceptable — do NOT use a random
  decorative animation
- no particle effects, no heavy animation dependency, no layout shifts
- respect prefers-reduced-motion (static or minimal indicator)
- do not cause excessive React renders: recognition events update refs;
  UI-visible state (transcript, live tiles) updates at a throttled rate
  (~4Hz) at most. Audit current render behavior and keep the page responsive
  while recognition is active

Also fix the perceived choppiness/large delay: audit the time from clicking
Start to LISTENING (permission prompt aside, state should change
immediately) and from Stop to PROCESSING (immediate), and keep the existing
premium visual language for any new state UI.

==================================================
MOST IMPORTANT PRODUCT UPGRADE — PERSONALIZED TRAINING
==================================================

The Speech Companion must stop being "speech analyzer + generic advice" and
become personal communication training. Reuse what exists — do not rebuild:
personalizationEngine.ts, sessionService.ts, the SpeechSession type, the
history page, and the dashboard's recommendation card are the foundation.

THE TRAINING LOOP to implement end to end:

  MEASURE → TARGET → DRILL → PRACTICE AGAIN → COMPARE → ADAPT

1. PERSONAL COMMUNICATION PROFILE

Derive, from REAL stored history only (never fabricate), per scenario and
overall: WPM, pause count, pause rate, filler count, filler rate, repetition
count, duration, word count, and trends (improving / worsening / stable) by
comparing recent sessions (e.g. last 3 vs prior 3, or last vs trailing
average — pick one, document it).

Present as "YOUR COMMUNICATION PATTERN", e.g.:

  INTERVIEW
  PACE      Improving
  PAUSES    Improving
  FILLERS   Recurring
  NEXT FOCUS  Filler control

2. SCENARIO-SPECIFIC PERSONALIZATION

Patterns must be evaluated PER SCENARIO. The system must NOT conclude "you
have a pause problem" from Interview sessions alone when Presentation
sessions are calm. Where data exists across scenarios, state the contrast:
"Your recent Interview sessions show more pauses than your Presentation
sessions." When a scenario has < 3 sessions but others do, profile that
scenario as baseline-in-progress, not "no data".

3. BASELINE MODE — NO FABRICATED TRENDS

If fewer than 3 comparable sessions exist for a judgment, show
"BASELINE IN PROGRESS" with one honest line ("InSign is learning your normal
pattern. Complete a few more sessions to unlock personalization.") and use
current sessions to build the baseline. The existing engine already refuses
to claim patterns under 3 sessions — preserve that honesty and the e2e test
that pins it ("Complete a few more sessions").

4. PERSONALIZED TARGETS (1–3 per session, measurable)

After every session show 1–3 targets of the form CURRENT → TARGET with a
concrete drill. Never generic advice like "Try speaking more slowly."
Example shape:

  PACE      Current 92 WPM   Target 100–115 WPM
            Drill: Speak for 30 seconds while maintaining a steady
            conversational pace.
  PAUSES    Current 7        Target ≤ 5
            Drill: Repeat the same answer using deliberate phrase breaks.
  FILLERS   Current 8        Target ≤ 4
            Drill: Repeat the answer and replace filler words with a
            deliberate silent pause.

Targets derive from: current performance, recent history, scenario, and
recurring patterns. No fake precision (target ranges, not 92.4 WPM).

5. ADAPTIVE TARGETS

- Target reached repeatedly (e.g. 2–3 consecutive sessions) → progress the
  target one step.
- Target missed repeatedly → do NOT simply make it harder. Keep the target,
  change the drill, and break the skill into a smaller exercise.
  Filler ladder example: (1) notice your fillers → (2) replace each filler
  with a deliberate silence → (3) 20-second response with zero fillers →
  (4) 45-second response with zero fillers.

6. DETERMINISTIC DRILL LIBRARY

Keyed to the user's actual weakness, each with progressive stages:

  PAUSE CONTROL       "Speak in short phrases. Pause deliberately only
                       between complete ideas."
  PACE CONTROL        "Practice a 30-second response inside your target
                       pace range."
  FILLER CONTROL      "Repeat the same response and replace filler words
                       with silent pauses."
  REPETITION CONTROL  "Use shorter phrases and deliberate starts."
  TRANSITION DRILL    "Connect two ideas using a prepared transition
                       phrase."

The drill shown after a session must correspond to the dominant remaining
weakness (priority: the metric furthest from target with the strongest
pattern support). No same-generic-advice-every-session.

7. PRACTICE AGAIN — CORE FEATURE

After results, a prominent PRACTICE AGAIN action that restarts the SAME
scenario with the CURRENT target and drill active. Above it, a compact
before/after panel:

  PREVIOUS ATTEMPT     92 WPM · 7 pauses · 8 fillers
  TODAY'S TARGET       100–115 WPM · ≤5 pauses · ≤4 fillers
  [ PRACTICE AGAIN ]

8. TARGET PROGRESS — COMPARE AFTER THE NEXT SESSION

When the next session completes, compare against the stored previous target:

  TARGET PROGRESS
  Pace     92 → 108 WPM   Target 100–115   ✓ TARGET REACHED
  Pauses   7 → 4          Target ≤5        ✓ TARGET REACHED
  Fillers  8 → 5          Target ≤4        ALMOST THERE

States: REACHED / ALMOST THERE (within a small tolerance, define it) /
NOT YET. Then select the next drill from the remaining weakness. Store the
target with the session outcome so progression is auditable.

9. HISTORICAL COMPARISON — PLAIN STATEMENTS

Where real history supports it, one-line comparisons, e.g.:

  "Your Interview pace improved from 91 → 106 WPM across your last 3
   sessions."
  "Pauses decreased from 8 → 5."
  "Fillers remain your main recurring focus."

Numbers, arrows, short text. No complicated charts. Only statements the
stored data supports.

10. SESSION ANALYSIS SCREEN — ANSWER SIX QUESTIONS

Restructure the results screen to flow:

  SESSION RESULTS   106 WPM · 4 pauses · 3 fillers · 2 repetitions
  ↓ WHAT STOOD OUT     one honest observation vs recent baseline
  ↓ YOUR NEXT TARGET   the measurable target(s)
  ↓ YOUR DRILL         the matched drill
  ↓ [ PRACTICE AGAIN ]

It must answer: What happened? What pattern did InSign notice? What should I
work on? What exact target? What drill? Can I try again immediately?

PERSONALIZATION STORAGE — inspect how preferences and sessions persist and
follow the existing pattern: in local-demo mode a localStorage structure; in
Supabase mode prefer an additive, minimal change (e.g. storing the active
target + drill stage alongside sessions or in an existing per-user JSONB
column, or a single small new table ONLY if no existing home fits). Do not
rebuild the schema. If a Supabase migration is genuinely required, keep it
additive, enable RLS matching the existing tables, and include it in the
final report. NEVER fabricate history: the engine reads only real stored
sessions, in both persistence modes.

==================================================
COPY & LANGUAGE RULES
==================================================

- Banned words anywhere in Speech Companion UI: cure, fix stuttering,
  diagnose, treatment, therapy, medical, clinical, disorder, condition.
- Use: communication pattern, speech pattern, practice, training, target,
  drill, personalized practice.
- Never present metrics as scores or grades; they are observed patterns.
- No fake precision: ranges over decimals; "about" where timing is coarse.
- Keep the existing premium voice (short, calm, editorial).

==================================================
PRIVACY & AI RULES
==================================================

- Preserve the existing privacy model and the honest browser-vendor
  disclosure (it is tested: "how speech is processed is disclosed honestly").
- Keep pattern analysis local where the architecture already does it.
- Respect the store-transcripts setting (redaction behavior is tested —
  do not regress it).
- Do not upload raw microphone audio anywhere new.
- Do NOT introduce OpenAI, Anthropic, Gemini, DeepSeek, or any paid runtime
  AI API. Personalization is deterministic logic over existing recognition +
  local analysis + stored history. Claude Code is the development tool, not
  a runtime dependency.

==================================================
PERFORMANCE
==================================================

- SpeechRecognition fires frequently: recognition events write to refs;
  React state updates are batched/throttled (~4Hz max for live UI).
- Memoize metric computations; never recompute full metrics per interim event.
- No new dependencies. No workers unless profiling proves a need.
- respect prefers-reduced-motion for the listening indicator and any new
  animation.

==================================================
TESTING
==================================================

Use the EXISTING frameworks only: the current unit-test runner (see
package.json scripts) and the existing Playwright e2e setup. Do not add
Selenium/Puppeteer/Cypress or a new unit framework.

UNIT (extend tests/unit/speechTiming.test.ts and metrics.test.ts):

- WPM: the 11 cases listed above.
- Pauses: gap 799ms (no), 800ms (yes — threshold is inclusive per spec),
  801ms (yes), multiple pauses, restart gap (no), leading silence (no),
  trailing silence ≥800ms before Stop (yes), long silence.
- Fillers: every required default filler (single + multi-word), punctuation,
  capitalization, substring false positives ("umbrella", "likelihood",
  "basically" vs "like"), custom-list override behavior.
- Repetitions: word, phrase, punctuation, capitalization, control text.
- Personalization: <3 sessions → baseline; ≥3 → pattern; scenario-specific
  isolation (3 interview + 2 presentation → interview-pattern only);
  improving trend; worsening trend; recurring weakness; target generation
  (1–3, measurable, from history); target reached/missed; adaptive
  progression (reached → progress; missed → same target, new drill/ladder);
  drill selection matches dominant weakness; honest statements only.

E2E (Playwright — the ONLY browser-test tool):

- Create a controllable SpeechRecognition mock for tests
  (e.g. tests/e2e/support installed via page.addInitScript): a fake class
  implementing the events the hook uses (onresult with final/interim
  results, onend, onerror, start/stop/abort) plus a page-exposed emit
  helper (e.g. window.__emitSpeechFinal(text) / __endRecognition()) and a
  permission/auto-grant stub so no real microphone is needed.
- MIGRATE the four Type-Transcript-dependent tests in speech.spec.ts to this
  mock (same assertions: exact WPM/pauses/repetitions/fillers from a known
  transcript; empty-session refusal; transcript redaction when
  store-transcripts is off; custom filler list). Do not delete coverage.
- Keep metric testids stable: metric-wpm, metric-pauses, metric-repetitions,
  metric-fillers. Add stable testids for new UI: communication pattern,
  targets, drill, practice-again, target-progress.
- ADD e2e: full loop with mocked recognition → save → seeded history
  (helpers.seedSpeechSessions) → results screen shows target progress and
  Practice Again preserves scenario → PRACTICE AGAIN restarts in LISTENING
  with the same scenario; LOCAL DEMO banner hidden when configuration
  flag is on (simulate via the same config seam); no console errors
  (trackConsoleErrors) on the practice and results screens.

Run: unit suite, then e2e (per existing scripts). Fix every failure and
re-run until green.

==================================================
IMPLEMENTATION ORDER (follow strictly; verify after each phase)
==================================================

PHASE 1  Inspect (report before editing — see STEP 0).
PHASE 2  Fix WPM root cause + timing architecture + WPM unit tests.
PHASE 3  Fix pause detection (threshold constant, trailing/restart fixes) +
         pause tests.
PHASE 4  Fix filler detection + filler tests.
PHASE 5  Verify/harden repetition detection + tests.
PHASE 6  Remove Type Transcript UI; migrate dependent e2e tests to the
         recognition mock.
PHASE 7  Remove placeholder/prototype banners.
PHASE 8  Local-demo messaging conditional on real configuration.
PHASE 9  Recording states (IDLE/LISTENING/PROCESSING/RESULTS) + listening
         indicator + render throttling.
PHASE 10 Session results screen restructure (what stood out / target / drill
         / practice again).
PHASE 11 Historical personalization (profile, scenario-specific, baseline).
PHASE 12 Personalized targets (generation + storage).
PHASE 13 Drill library + adaptive progression.
PHASE 14 Practice Again.
PHASE 15 Target comparison + progression states.
PHASE 16 Run full unit suite, e2e suite, typecheck, and production build;
         fix everything; re-run until stable.

After EVERY phase: run the relevant tests + typecheck, fix, then continue.

==================================================
DO NOT OVERBUILD
==================================================

- No application rewrite; no redesign of unrelated pages.
- No new dependencies unless genuinely unavoidable (report if so).
- No complicated graphs; no fake AI; no fabricated history or trends.
- No changes to Sign Translator, MediaPipe, Kalman, classifier, camera,
  landing page, or GitHub.
- Reuse existing code, services, types, styling, and test helpers.

==================================================
FINAL ACCEPTANCE CRITERIA
==================================================

[ ] 54000 WPM bug fixed at root cause (no display clamps)
[ ] WPM mathematically valid from word count + actual session duration
[ ] recognition restarts do not corrupt timing or inflate WPM
[ ] Stop correctly finalizes duration exactly once (grace-window results counted)
[ ] pauses reliably detected; 800ms threshold in one constant
[ ] restart gaps never create fake pauses; trailing silence counted
[ ] fillers reliably detected; multi-word fillers work; no substring false positives
[ ] custom filler list still works
[ ] repetitions robust to case/punctuation
[ ] Type Transcript removed from UI; dependent tests migrated, coverage kept
[ ] placeholder-pipeline and 24H-prototype messages removed
[ ] Local Demo messaging hidden when Supabase is configured
[ ] listening state obvious and smooth; states IDLE/LISTENING/PROCESSING/RESULTS
[ ] no render thrash during recognition
[ ] results screen answers the six questions
[ ] historical sessions affect recommendations (no fabricated trends)
[ ] scenario-specific personalization; cross-scenario contrast where data exists
[ ] baseline mode honest under 3 sessions
[ ] targets measurable (current → target → drill)
[ ] drills match the dominant weakness; adaptive ladder on repeated misses
[ ] Practice Again preserves scenario + target + drill
[ ] next session compares against previous target (REACHED / ALMOST / NOT YET)
[ ] targets evolve from results
[ ] no medical claims
[ ] no paid AI APIs
[ ] existing Sign Translator untouched
[ ] GitHub untouched
[ ] unit + e2e + typecheck + production build all green

==================================================
FINAL VERIFICATION (before finishing)
==================================================

1. Run existing unit tests. 2. Run the new Speech Companion regression tests.
3. Run typecheck. 4. Run production build. 5. Confirm no Speech-related
console errors in e2e. 6–10. Demonstrate via tests: WPM sanity, pause
thresholds, filler tokenization, Stop finalization, restart behavior.
11. Demonstrate historical personalization with seeded sessions. 12–13.
Demonstrate Practice Again and target comparison. 14–15. Screenshot both
themes at 1920×1080 and 390×844 for the practice and results screens; check
no overlap/overflow (expectNoHorizontalOverflow). 16. git status: confirm no
Sign Translator / landing / unrelated files modified. 17. grep: no paid-AI
dependencies added. 18. git log/status: no commits, no pushes.

==================================================
FINAL REPORT (produce at the end, in this order)
==================================================

1. Files changed (with one-line reason each)
2. WPM root cause and the fix (with the math of a before/after example)
3. Pause detection root cause and the fix
4. Filler detection root cause and the fix
5. Repetition changes
6. Recording UX changes
7. Personalization changes (profile, scenario-specific, baseline)
8. Target-generation logic (inputs, formulas/ranges, storage)
9. Drill system (library, selection rule, adaptive ladder)
10. Practice Again implementation
11. Tests added/changed
12. Test results (unit, e2e counts; failures fixed)
13. Build result
14. Remaining limitations (be honest — e.g. Web Speech timing granularity)

DO NOT commit. DO NOT push. DO NOT touch GitHub.
