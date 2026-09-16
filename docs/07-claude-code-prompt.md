# InSign — Claude Code Implementation Prompt
Copy **everything below the line** into Claude Code as one prompt. The `docs/` folder must be present in the repo when you run it.

---

You are implementing the complete frontend of **InSign** for a 24-hour university hackathon. InSign is a premium accessibility platform with two products: a **Speech Companion** (personalized communication practice for people who stutter) and a **Tremor-Tolerant Sign Translator** (computer-vision sign recognition that tolerates natural movement variation). The core message of the entire product: **"Technology should adapt to how you communicate."**

You will build ONLY the frontend. Do NOT implement AI, speech recognition, sign-language recognition, backend logic, or Supabase — but DO leave clean typed integration seams for them. All dynamic content uses realistic mock data, visibly labeled `DEMO DATA`.

## STEP 0 — Inspect before writing

1. Read the full design specification first — it is binding: `docs/01-design-concept.md` (philosophy + hard bans), `docs/02-design-system.md` (all tokens + component specs), `docs/03-page-and-component-architecture.md` (routes + canonical component tree + screen content), `docs/04-flows-states-responsive-accessibility.md` (flows, state matrix, responsive, a11y, perf budgets), `docs/05-motion-and-3d.md` (motion tokens + the 3D scene "The Weave" + microinteractions), `docs/06-data-model-and-mock-data.md` (conceptual entities + required mock datasets + integration interfaces).
2. Then inspect the existing project: detect the framework (this project targets **Next.js App Router + TypeScript + Tailwind CSS**; if the repo already uses something else viable, PRESERVE it and adapt the design to it rather than rewriting). Inventory existing pages, components, styles, config, and any installed packages. Reuse what exists and is useful; do not delete prior work unless it directly conflicts with this design, and never remove unrelated code.
3. If package installation is needed, prefer: `three`, `@react-three/fiber`, `@react-three/drei`, `framer-motion` (or Motion), `lucide-react`. Fonts via `next/font`: Geist (display/UI), Instrument Serif (italic accent), Geist Mono (data). Verify each library is compatible before adding; if the 3D stack conflicts with the environment, implement the hero as the documented static-poster fallback and note it.

## THE VISUAL CONTRACT (non-negotiable)

Premium technology product — think precision-instrument aesthetic, NOT medical site, NOT charity site, NOT generic AI SaaS.

- Canvas `#0A0A0B`; surfaces `#111113 / #17171A / #1E1E22`; warm white text `#F5F4F1`; hairline borders `rgba(255,255,255,0.08)`.
- Exactly ONE accent: signal amber `#E8A33D`, used ONLY for live/active/adapting states, focus rings, and recommended items. ≤5% of any screen.
- Gradients: at most 2 subtle amber light pools on the entire landing page, plus flat fade masks. NOTHING else.
- FORBIDDEN: purple/blue/pink gradients, gradient buttons/text, glowing card borders, neon, glassmorphism beyond one blurred navbar, floating blobs, sparkle icons, starfields, generic neural-net visuals, spinners, emoji icons, rounded-corner soup.
- Typography: huge display statements (clamp 56–118px), generous whitespace, few words. One italic serif word per major statement (*adapt*, *you*, *recognised*). Mono uppercase overlines like `04 — SPEECH COMPANION`.
- Signature motif everywhere: **the grid and the signal** — rigid hairline structure bent by human waveform motion.
- Radii: 6/10/14/20px scale, circles only for orbs/dots/pills. Shadows are black elevation, never glow.

## BUILD PHASES (in order; commit-worthy checkpoints)

### Phase 1 — Foundation
- Design tokens as CSS custom properties + Tailwind config (colors, spacing 4px scale, radius, elevation, motion curves `cubic-bezier(0.22,1,0.36,1)` / `(0.65,0,0.35,1)`, durations 150/350/700/1100ms).
- Global styles: focus ring (2px amber, offset 2px), selection color, scrollbar styling, skip-link.
- `MotionProvider`: respects `prefers-reduced-motion` + a Settings toggle; one switch drives all motion behavior globally.
- Primitives in `components/ui/` exactly per doc 02 §4: Button (primary/accent/secondary/ghost/destructive), Card, Input, Badge (+ `DEMO DATA` badge), Meter, RingMeter, Modal, Tabs, Toast, Skeleton, StatusDot. No spinners anywhere in the product.
- Mock data modules in `lib/mock/` exactly per doc 06 §3 (scenarios, ~14 speech sessions over 3 weeks with the interview-hard/conversation-easy pattern, 3 full feedback reports, adaptive plan, 5 sign results with confidences, landmark/trajectory arrays, progress numbers). Numbers must be consistent across all screens.
- Integration stubs in `lib/integrations/` exactly per doc 06 §4: `speechAnalysis.ts`, `signRecognition.ts`, `speechCapture.ts`, `database.ts`, `auth.ts`, `tts.ts` — each a typed interface + mock implementation + `// TODO(integration):` notes. UI components import ONLY these interfaces.

### Phase 2 — Landing page (`/`) — the cinematic scroll
Sections 01–10 as components per doc 03 §3, orchestrated by `LandingShell` with the right-edge `ChapterRail` (mono indices, scroll-spy):
- **01 Hero:** wordmark + "Technology should adapt to how you communicate." (serif italic on *adapt*) + one support line + CTAs "Explore InSign" / "See how it works".
- **02 Problem:** "Communication isn't one-size-fits-all." + STANDARD INPUT (rigid ticks) vs HUMAN SIGNAL (irregular waveform) columns; a bent hairline between them.
- **03 Idea (pinned, scroll-driven):** "Don't adapt yourself to technology." → statement swap to "Make technology adapt to *you*." while a rigid grid visually warps toward the cursor and amber appears.
- **04 Speech Companion:** live-styled waveform + PRACTICE → LEARN → ADAPT loop diagram (animated signal pulse) + 4 ScenarioCards.
- **05 Adaptive:** difficulty meters (Interview HIGH / Presentation MEDIUM / Conversation LOW) fill on scroll; "NEXT SESSION" panel recommends Interview with reason. `DEMO DATA` badge.
- **06 Sign Translator:** MOVEMENT → STABILIZATION → RECOGNITION flow diagram; jittery polyline snaps to a clean arc in view.
- **07 Raw → Stable (showpiece, pinned):** full-width canvas — gray jittery RAW trajectory draws, then smooth amber STABLE path draws over it, ends in chip `RECOGNISED: "THANK YOU"` + confidence meter. Mouse adds live jitter to RAW; toggle replays.
- **08 Philosophy:** split "Adapts to how you *speak*." / "Adapts to how you *move*." → "Same principle. Technology adapts to the person."
- **09 Preview:** Speech ⇄ Sign switcher over mock app UI frames (reuse real app components with mock data).
- **10 Finale:** "Human communication has no single standard." + wordmark + tagline + "Try InSign". Footer below.

### Phase 3 — 3D hero "The Weave" (docs 05 §2 — follow it exactly)
React Three Fiber, dynamic import `ssr:false`. Scene = rigid point-lattice Field (~9k pts) + 3–5 irregular luminous waveform ribbons with traveling amber pulses + central Adaptive Form (~700 particles on ~12 spline segments, fragmented at idle). Mouse: lerped camera parallax; form particles align toward cursor ray and relax back — "adapts to you" literally. Click: radial pulse through the field. Scroll: camera dolly + parallax layer separation; scene pauses off-screen/hidden tab. DPR ≤1.5, particle counts are ceilings. Mobile + reduced-motion: static poster fallback in the same visual language. Entrance: field fades → waves draw → form assembles.

### Phase 4 — Auth UI (`/auth/*`, visual only)
Login / Signup / Forgot / Reset per doc 03: split AuthLayout (quiet brand panel + form column), mono uppercase labels, show-password, strength meter, OAuth buttons visual-only, inline validation, submitting/success/error states, forgot-password inbox confirmation with resend cooldown. No real auth logic — call the `auth.ts` stub.

### Phase 5 — Application shell + Dashboard
`AppShell`: sidebar (Dashboard, Speech Companion, Sign Translator, Progress, Settings; active = amber-dim left rule), topbar, NO 3D anywhere in the app. Mobile: bottom tab bar. **Dashboard:** "Welcome back" + two FeatureCards (Speech Companion / Sign Translator, each with mini visualization) + RecommendedPracticeCard + ProgressPanel (RingMeter, streak, 12-week heatmap) + RecentPractice + ActivityList + first-run empty states. Elegant, spacious, no KPI clutter.

### Phase 6 — Speech Companion frontend
`/companion` scenario grid (Interview, Presentation, Phone Call, Introduction, Custom) with per-scenario difficulty meters. `/companion/practice`: MicOrb (idle/armed/recording states with amber ring + red recording state), live waveform, mono timer, Start/Stop/Cancel transport, status line `READY — LISTENING — PROCESSING`, 5:00 cap, leave-guard modal, mic-denied state. `/companion/feedback`: placeholder report — PaceMeter, PauseTimeline, DifficultMomentsList, neutral SessionNotes, RingMeter, `DEMO DATA` badge prominently. Tone rules from doc 01 §4 (never "fix/cure", no medical claims).

### Phase 7 — Sign Translator frontend
`/translator`: CameraStage (letterboxed 16:9, viewfinder corner brackets) + LandmarkOverlay (21-pt skeleton, hairline bones, amber fingertips) + TrajectoryOverlay (raw gray + smoothed amber) + TrackingStatus rail (`SEARCHING / TRACKING / HOLD STEADY / RECOGNIZED`) + RecognitionPanel (large text, Speaker/Copy/Reset) + history chips. Mock the tracking state machine cycle from doc 06. Camera-permission-denied and no-camera states designed. `/translator/demo`: standalone Raw → Smoothed → Recognized step demo with scrubber for the judge walkthrough.

### Phase 8 — Progress, Settings, 404, how-it-works
`/progress`: AdaptivePlanPanel (per-scenario difficulty + recommended + "why this?"), HistoryCalendar heatmap + accessible table fallback, SessionTable. `/settings`: device selects, text-size stepper (applies `data-text-scale`), motion toggle, privacy note ("Practice data stays on this device in demo mode"). `not-found.tsx` on-brand.

### Phase 9 — Responsive, accessibility, polish
- Apply the responsive table in doc 04 §3 (mobile 3D = poster fallback; chapter rail → top hairline progress; app → bottom tabs; chapter 07 → autoplay loop).
- Meet the full a11y spec doc 04 §4: keyboard-complete (skip link, focus trap, arrow-key switcher/rail), aria labels + live regions for recording/tracking/recognition announcements, canvas `role="img"` descriptions, 44px targets, reduced-motion contract everywhere, text scaling reflow.
- Perf budgets doc 04 §5: hero text is HTML (LCP), 3D pauses when hidden, transform/opacity-only scroll animations, chapter unmounting, `next/font` subsetting.
- Polish pass: magnetic CTAs, card hover depth, masked text reveals, navbar shrink at 80px, custom cursor (desktop, additive), flip-clock timer digits, the hairline-sweep page transition from landing into the app.

## VERIFICATION (do all before finishing)
1. `npm run build` (or project equivalent) passes typecheck with zero errors.
2. Walk every flow: landing scroll 01→10 → signup → dashboard → companion (select→practice→cancel guard→record→feedback) → translator (states + demo) → progress → settings. Confirm each state-matrix cell from doc 04 §2 renders.
3. Keyboard-only pass: can you complete auth + one practice + translator demo without a mouse?
4. Reduced-motion pass: toggle it — 3D poster, no pins, no magnetic, no autoplay demos, everything still usable.
5. Mobile pass: 390px and 768px widths — no horizontal scroll, poster hero, bottom tabs.
6. Lighthouse desktop: performance ≥90, accessibility ≥95, best practices ≥95.
7. Consistency audit: every mock panel has the `DEMO DATA` badge; no banned visual patterns anywhere (grep your own components for gradient/border-glow habits); mock numbers agree across dashboard/progress/landing.

## ACCEPTANCE CRITERIA
A judge landing on `/` understands within 10 seconds that InSign adapts to the person; the hero is interactive and unique to InSign; the dashboard is clean and functional; both product flows are complete with mock data; accessibility works; the codebase has typed seams where AI, speech processing, computer vision, Supabase, and auth will later plug in — each marked `TODO(integration)`.

When done, output: a file map of what you built, the list of integration seams and their interfaces, and any deviations from the docs with reasons.
