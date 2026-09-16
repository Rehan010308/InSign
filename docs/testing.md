# Testing

Two suites, and a clear split between them: **Vitest** owns everything pure, and
**Playwright** owns everything that needs a browser. There is no third tool.

```bash
npm run test:unit     # vitest run
npm run test:e2e      # playwright test  (starts the dev server itself)
npm test              # both
```

The sign specs need the MediaPipe assets in `public/`. `npm install` fetches
them; run `npm run assets` if you cleaned them out. Without them the app still
works (it falls back to the CDN) but the suite then depends on the network.

## Unit tests — `tests/unit/`

71 tests over the modules that have no DOM in them at all.

| File | What it pins down |
| --- | --- |
| `metrics.test.ts` | exact WPM, pause, repetition and filler counts on fixed fixtures, for both the spoken and the typed path |
| `kalman.test.ts` | the filter halves the error against the intended trajectory of a trembling hand, still tracks a 2 Hz movement, and does not lag a ramp |
| `normalizer.test.ts` | wrist at the origin, unit scale, rotation aligned, and invariance to position/size/tilt |
| `classifier.test.ts` | each unambiguous sign is recognised from its canonical sequence; an unknown movement returns nothing; tremor does not break recognition; THANK YOU/GOOD stay an honest tie |
| `personalization.test.ts` | the full decision table — no history, under three sessions, outside the 14-day window, each of the four patterns, the consistent-sessions case, and determinism |
| `contextEngine.test.ts` | the three outcomes, the bigram tie-break, and that no sign can be invented |

### Synthetic hands

`tests/fixtures/signSequences.ts` generates landmark frames from the same
canonical hand model the templates come from (`src/lib/sign/handModel.ts`).

That is worth being explicit about: these tests prove the **pipeline** behaves —
a matching shape and path score high, an unknown one is refused, tremor is
absorbed — not that real signers match these coordinates. Validating against real
hands is the work a trained model takes over (see `docs/classifier.md`).

## End-to-end tests — `tests/e2e/`

230 tests: five viewports (1920×1080, 1440×900, 1366×768, 768×1024, 390×844)
against the dev server, with Chromium's fake camera and microphone.

| Spec | Covers |
| --- | --- |
| `landing.spec.ts` | the nine chapters render, nav anchors land below the sticky bar, Try InSign routes to sign-up, the theme toggle flips/persists/notifies the background canvas, the canvases actually paint non-zero pixels, the contact mailto is ≤20px, no horizontal overflow, zero console errors |
| `speech.spec.ts` | protected routes redirect with `next`, sign-up/in/out, inline form errors, a typed transcript producing **exact** metric values, empty-save refusal, the processing disclosure, the <3-session refusal, the ≥3-session recommendation (matching the unit fixture's numbers), transcript redaction when store_transcripts is off, a custom filler list |
| `sign.spec.ts` | the camera is only requested on request, video + overlay start, a recognised sign reaches the strip, RAW and STABILIZED are both painted, an unknown movement is refused, no-hand and two-hand states, Clear, camera tracks end on route leave, the vocabulary list |
| `accessibility.spec.ts` | landmarks and heading order, one h1 per page, skip link first, keyboard-only reach, visible focus rings, live regions, contrast in both themes, text alternatives for the visualisations |
| `screenshots.spec.ts` | the visual QA pass (below) — not an assertion suite |

### Driving the sign pipeline

A fake webcam cannot form a sign, so `sign.spec.ts` injects recorded landmark
frames through `window.__insignSignPipeline`, a hook the page exposes for the
suite. It injects **input only**: Kalman smoothing, the temporal window, the
classifier, the confidence gate and the context engine are all the production
code path. `pauseLive()` stops the camera loop first so live frames and injected
ones are not fighting.

This is the line the suite does not cross: tests never mock the UI into showing
something the pipeline did not produce.

### Camera and permission states

Permissions are granted at the context level and the fake device is supplied by
`--use-fake-device-for-media-stream`. The denied-camera test overrides
`navigator.mediaDevices.getUserMedia` to reject with `NotAllowedError`, because
Chromium's fake device would otherwise auto-accept, and then asserts the recovery
UI and that the app shell survives.

### Why two workers

Every worker that reaches the sign page loads MediaPipe and builds a GPU graph.
More than two at once starves them and the camera tests time out; the config
pins `workers: 2` and allows one retry.

## Visual QA

```bash
npx playwright test tests/e2e/screenshots.spec.ts
```

Writes `tests/screenshots/<viewport>/<theme>-NN-<surface>.png` — every landing
chapter, sign-up, dashboard, scenarios, the speech disclosure, practice, review,
history, settings, the sign stage idle and live, the open mobile menu, and 404 —
in both themes at all five viewports. They are meant to be looked at, not
diffed; the pass that produced the current build found the panel-vs-micro font
override, the activity strip baseline, and the field spacing in the practice
column.

## What the suite has caught

Worth recording, because it is the argument for keeping it:

- the app's collapsed mobile menu opened empty — the landing stylesheet's
  `.nav-links a:not(.btn){display:none}` out-specified the app links below 820px
- the page faded in from white on every load, because the body's theme transition
  started before the stylesheet applied
- light-mode amber measured 3.73:1 on ivory, under the 4.5:1 its small mono
  labels need
- the decorative background canvas swallowed clicks on the footer links
- landing heading order skipped levels (h2 → h5)
