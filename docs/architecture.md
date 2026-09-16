# InSign — architecture

One React app, two pipelines, one design system. The rule that shapes the
layout: anything that is pure computation lives in `lib/` or `services/` and is
unit-tested there; anything that touches React lives in `features/`, `pages/` or
`hooks/` and is tested through Playwright.

## Module map

```
src/
  main.tsx                    entry: providers (error boundary → theme → auth → router)
  App.tsx                     routes; the sign page is lazily imported
  index.css                   imports the two stylesheets, once

  styles/
    style.css                 the original landing design system — tokens, keyframes, .rv/.mask
    app.css                   app surfaces, built only from style.css's tokens

  components/                 shared shell: LandingNav, LandingFooter, AppShell, AuthLayout,
                              ThemeToggle, ModeBanner, RequireAuth, RootErrorBoundary,
                              SignalBackground
  pages/                      Landing, auth/SignIn, auth/SignUp, Dashboard, SpeechPractice,
                              SpeechHistory, SpeechSessionDetail, SignTranslate, Settings, NotFound

  features/
    speech/                   ScenarioPicker, PracticePrompt, ListeningStage,
                              SessionResults, LiveTranscript, VoiceBars, PracticeTimer
    sign/                     useSignPipeline (the rAF loop), LandmarkOverlay (canvas drawing)

  lib/
    landing/                  signalBackground.ts, landingInteractions.ts — the original
                              canvas/scroll sequencers, each returning a cleanup function
    speech/                   useSpeechRecognition.ts, metrics.ts, questionBank.ts,
                              coach.ts, useMicLevel.ts
    sign/                     useCamera.ts, useHandLandmarker.ts, kalman.ts, normalizer.ts,
                              featureWindow.ts, classifier.ts, classifierTemplates.ts, handModel.ts

  services/                   supabaseClient.ts, localStore.ts, authService.tsx,
                              sessionService.ts, personalizationEngine.ts, contextEngine.ts
  hooks/                      useTheme.tsx
  types/                      the domain types shared by both backends
```

### Why the landing sequencers return a cleanup

The original page was a classic script that ran once and never stopped. In an
SPA that leaks: every route change would leave listeners, observers and
animation frames running. `initLandingInteractions()` and
`startSignalBackground()` register everything through a local registry and hand
back a disposer, which the components call from `useEffect`. Behaviour is
unchanged; the lifetime is not.

## Speech pipeline

```
 microphone ──► Web Speech API ──► transcript (final + interim)
                                        │
        question bank ──► prompt         ▼
        (deterministic,            metrics.ts (pure)
         scenario-specific)     pace · pauses · repetitions · fillers
                │                       │
                ▼                       ▼
        coach.ts (pure) ◄──── scenario history (speech_sessions)
        profile · target · drill · comparison
                │
                ▼
         sessionService.saveSpeechSession
                │
                ▼
     speech_sessions · speech_patterns · practice_recommendations
```

Three things are worth stating plainly.

**The session is one wall clock.** Duration is measured once, from Start to
Stop, and pace is words over that duration. Nothing a recognition restart does
can touch it. The previous approach derived "speaking time" by subtracting the
gaps between recognition results from the session; those gaps contain each
phrase's own speech, so the remainder collapsed towards zero and a normal
sentence could be reported at tens of thousands of words a minute. Utterance
spans are still measured, but only to tell silence between phrases from speech
— never to divide into words.

**Everything after the transcript is local and deterministic.** Pace, pauses,
repetitions, fillers, the question that comes next, the target, the drill and
the comparison are all pure functions of the transcript, its timing, and the
sessions the user actually saved. There is no model and no network call in any
of it, and no paid AI service anywhere in the deployed app. Given the same
history, the same answer comes back — which is what makes it unit-testable and
what makes a recommendation defensible.

**Personalization is per scenario and refuses to guess.** Interview history
shapes interview practice and nothing else. Below three sessions in a scenario
the coach says it is still building a baseline rather than claiming a pattern,
and no target is ever phrased as advice — it is a number the next attempt is
measured against.

## Sign pipeline

```
 camera (getUserMedia, on request only)
        │
        ▼
 MediaPipe HandLandmarker  ── GPU delegate, CPU fallback,
        │                             local model + wasm, CDN as the last resort
        │  21 landmarks per hand, image space
        ▼
 LandmarkSmoother (21 × 3 Kalman1D)  ── keeps BOTH raw and stabilized
        │                                  └─► LandmarkOverlay draws both, every frame
        ▼
 FeatureWindow  (~1.2 s rolling)
        │  per frame: normalize → pose fingerprint → palm centroid
        │  per window: motion features (path, net, amplitude, turning points)
        ▼
 TemplateMatcherClassifier
        │  shape gate → per-template similarity → quality floor → softmax → top-3
        ▼
 contextEngine.decide(candidates, threshold, state)
        │  emit · possible · unclear   (+ bigram tie-break, marked as adjusted)
        ▼
 hold 400 ms · debounce repeats 1.5 s
        ▼
 output strip ──► sign_sessions (recognised signs only; no video, no landmarks)
```

Performance rules the loop follows:

- one rAF loop, gated to ≤30 fps, classifying every fifth processed frame
- landmarks, the smoother and the window live in refs; React state changes only
  when the tracking chip, the candidate list or the output actually changes
- the loop stops on `visibilitychange` and on unmount, and the camera tracks are
  stopped with it (asserted in `tests/e2e/sign.spec.ts`)

The model and the wasm runtime live in `public/` but are not committed — they are
~37MB of binaries that `scripts/fetch-vision-assets.mjs` reproduces on install.
`useHandLandmarker` tries local assets first and the official CDN second, and the
UI shows a "MODEL LOADED FROM CDN" badge when the fallback was used, so the
difference is never hidden.

## Data layer

`sessionService.ts` is the only module that talks to storage, and it presents
one shape to the app regardless of backend:

- **Supabase** — the real path. Row-level security means every query is already
  scoped to `auth.uid()`; the client never filters by user for safety, only for
  clarity.
- **Local demo store** — used when the env vars are absent. Same functions,
  localStorage underneath, and `ModeBanner` states which one is live on every
  app screen so the fallback can never quietly pass for the real thing.

When Supabase is configured but unreachable, writes are queued locally and
retried on the next dashboard visit (`flushPendingSessions`), with an offline
banner while that is true.

## Error boundaries

There are two. The top-level one wraps the whole tree and renders in the landing
design language with a reload and a contact address. The sign page has its own,
so a classifier or MediaPipe failure releases the camera and offers a retry
without taking the app shell down.
