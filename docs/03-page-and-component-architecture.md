# InSign — Page & Component Architecture
Routing, screen inventory, and the complete component tree. This is the file Claude implements from — keep names canonical.

---

## 1. Route map (Next.js App Router)

| Route | Screen | Mode |
|---|---|---|
| `/` | Landing (cinematic scroll) | Public |
| `/how-it-works` | Deep-dive explainer (3 anchors: speech loop, raw→stable, philosophy) | Public |
| `/auth/login`, `/auth/signup`, `/auth/forgot-password`, `/auth/reset-password` | Auth screens | Public |
| `/dashboard` | App home | App shell |
| `/companion` | Speech Companion entry: scenario select | App shell |
| `/companion/practice` | Practice screen (mic, waveform, timer) | App shell |
| `/companion/feedback` | Feedback screen (placeholder AI data) | App shell |
| `/translator` | Sign Translator (camera, landmarks, results) | App shell |
| `/translator/demo` | Raw → Stable → Recognized demo visualization | App shell |
| `/progress` | Progress history, adaptive plan, activity | App shell |
| `/settings` | Preferences (camera/mic, text size, reduced motion, data) | App shell |
| `not-found.tsx` | 404 (on-brand, single statement + link home) | Public |

Landing sections 02–09 live on `/` as components (scroll chapters), deep-linkable via hash (`/#adapt`, `/#raw-to-stable`).

---

## 2. Component tree (canonical names)

```
src/
├── app/                          # routes above
├── components/
│   ├── landing/
│   │   ├── LandingShell          # scroll container, chapter orchestration, progress rail
│   │   ├── Navbar                # (design system §5)
│   │   ├── ChapterRail           # 01–10 scroll-spy indices
│   │   ├── chapters/
│   │   │   ├── Chapter01Hero
│   │   │   ├── Chapter02Problem        # "Communication isn't one-size-fits-all."
│   │   │   ├── Chapter03Idea           # "Don't adapt yourself…" → "Make technology adapt to *you*."
│   │   │   ├── Chapter04Companion      # waveform + scenario cards + loop
│   │   │   ├── Chapter05Adaptive       # difficulty meters + plan adapting
│   │   │   ├── Chapter06Translator     # Movement → Stabilization → Recognition
│   │   │   ├── Chapter07RawToStable    # interactive trajectory demo
│   │   │   ├── Chapter08Philosophy     # two products, one principle
│   │   │   ├── Chapter09Preview        # product switcher previews
│   │   │   └── Chapter10Finale         # statement + CTA
│   │   └── shared/
│   │       ├── ChapterHeading        # overline index + display statement + serif word slot
│   │       ├── ScenarioCard          # Interview / Presentation / Phone Call / Conversation
│   │       ├── LoopDiagram           # Practice → Learn → Adapt (SVG, animated)
│   │       ├── FlowDiagram           # Movement → Stabilization → Recognition
│   │       ├── DifficultyMeter       # meter with LOW/MEDIUM/HIGH state
│   │       ├── ProductSwitcher       # Speech ⇄ Sign segmented control
│   │       └── CTABlock
│   ├── three/
│   │   ├── HeroCanvas              # single R3F root, dynamic import, ssr:false
│   │   ├── TheWeave                # grid+waveform field (doc 05 §2)
│   │   ├── AdaptiveForm            # self-organizing particle form
│   │   ├── useReducedMotionScene   # swaps scene for static poster
│   │   └── useScrollCamera         # camera rig driven by scroll progress
│   ├── app/                      # application shell + screens
│   │   ├── AppShell               # sidebar + topbar + content outlet
│   │   ├── Sidebar / Topbar / UserChip
│   │   ├── dashboard/ FeatureCard, ProgressPanel, RecommendedPracticeCard, ActivityList
│   │   ├── companion/ ScenarioGrid, ScenarioCard, PracticeStage (MicOrb, WaveformDisplay,
│   │   │              RecordingTimer, TransportControls), FeedbackReport
│   │   │              (PaceMeter, PauseTimeline, DifficultMomentsList, SessionNotes)
│   │   ├── translator/ CameraStage, LandmarkOverlay, TrajectoryOverlay, TrackingStatus,
│   │   │               RecognitionPanel, TranslationHistory, DemoVisual (raw/stable toggle)
│   │   ├── progress/ HistoryCalendar (12-week heatmap), SessionTable, AdaptivePlanPanel
│   │   └── settings/ PreferenceSection
│   ├── auth/ AuthLayout, AuthForm, PasswordField, OAuthButtons (visual only)
│   └── ui/                       # design-system primitives: Button, Card, Input, Badge,
│                                 # Meter, RingMeter, Modal, Tabs, Toast, Skeleton, StatusDot
├── lib/
│   ├── mock/                     # ALL placeholder data, one module per domain (doc 06)
│   ├── integrations/             # EMPTY stubs with typed interfaces (doc 06 §5)
│   ├── hooks/                    # useReducedMotion, useScrollProgress, useInView,
│   │                             # useMagneticHover, useCountUp, useMediaQuery
│   └── utils/                    # cn(), formatters
└── styles/                       # globals.css: tokens (doc 02 §1–3)
```

Rules: `ui/` primitives have no product logic; landing chapters are independent (mount/unmount via scroll for perf); all mock data imported **only** from `lib/mock/`; every integration stub typed with `interface` + `// TODO(integration)` marker so Claude's later backend work has exact seams.

---

## 3. Screen content specs (what goes on each, exactly)

### Chapter 01 — Hero
Wordmark `display-1`, tagline with *adapt* in serif italic, one supporting sentence, CTAs (primary "Explore InSign" → dashboard; secondary ghost "See how it works" → `/#problem`). 3D scene behind. Scroll cue: mono "SCROLL" + animated hairline. Overline: `01 — INSIGN`.

### Chapter 02 — Problem
Overline `02 — THE PROBLEM`. Statement: **Communication isn't one-size-fits-all.** One supporting sentence max. Visual: two hairline columns — left "STANDARD INPUT" with rigid, identical tick bars; right "HUMAN SIGNAL" with irregular waveform bars. The right column subtly animates (irregular = alive). A hairline between them is *bent* by the waveform — grid+signal motif in 2D.

### Chapter 03 — Idea
Two-beat scroll sequence. Beat 1 (pinned): **Don't adapt yourself to technology.** — rigid grid lines, cooler/dimmer. Beat 2: statement swaps to **Make technology adapt to you.** — same grid now warps toward cursor, type brightens, *you* in serif italic, amber accent appears. Single visual transition carries the whole argument.

### Chapter 04 — Speech Companion
Overline `04 — SPEECH COMPANION`. Product eyebrow: "PRODUCT 01". Hero visual: large live-styled waveform (amber when "active", white idle). LoopDiagram: PRACTICE → LEARN → ADAPT (three nodes, animated signal pulse traveling the loop). ScenarioCards ×4: Interview, Presentation, Phone Call, Conversation — icon + mono duration label ("TYPICAL: 3–5 MIN").

### Chapter 05 — Adaptive Speech
Overline `05 — IT LEARNS YOU`. Left: three DifficultyMeters (Interview HIGH · Presentation MEDIUM · Conversation LOW, mono value labels, `DEMO DATA` badge). Right: "NEXT SESSION" panel with recommended scenario = Interview (amber left rule, "RECOMMENDED" badge, accent Start button) + one-line reason in body text. On scroll, meters fill to values, then the right panel slides in — the product visibly reorganizing around the user.

### Chapter 06 — Sign Translator
Overline `06 — SIGN TRANSLATOR`. Eyebrow "PRODUCT 02". FlowDiagram: MOVEMENT → STABILIZATION → RECOGNITION (three hairline nodes; middle node shows a jittery polyline snapping to a clean arc when in view). Supporting sentence about tremor tolerance. No literal hand imagery — abstract trajectory only.

### Chapter 07 — Raw → Stable (showpiece)
Overline `07 — RAW → STABLE`. Interactive 2D canvas (60–70vh): one continuous gesture path rendered twice — RAW: jittery, trembling, gray; STABLE: smooth Bézier, amber, drawn with 600ms delay. Center toggle (segmented: RAW / STABLE) + auto-demo on scroll into view. End point resolves into a chip: `RECOGNISED: "THANK YOU"` + mono confidence bar + `DEMO DATA` badge. Mouse adds fresh jitter to RAW live. This is the strongest section — give it full pinned-scroll treatment (path draws while pinned, ~1.5 viewport heights).

### Chapter 08 — Philosophy
Split screen, hairline divider: left PRODUCT 01 "Adapts to how you **speak**." / right PRODUCT 02 "Adapts to how you **move**." (serif italic verbs). Below, single centered line: **Same principle.** → **Technology adapts to the person.** Divider line between the halves *bends* toward the cursor — final grid+signal echo.

### Chapter 09 — Product preview
ProductSwitcher (Speech Companion ⇄ Sign Translator) above a large `media` card containing a static/mock UI frame of each app (build as real components fed by mock data — reuse app components where possible). Switch: 500ms cross-fade + 12px y-shift. Desktop: both visible side by side with switcher dimming the inactive one instead of hiding it.

### Chapter 10 — Finale
Full-viewport. **Human communication has no single standard.** → wordmark → tagline → primary CTA "Try InSign". Second allowed light pool gradient. Footer below.

---

### Auth screens
Shared AuthLayout: split — left 45% quiet brand panel (wordmark, tagline, one line, faint static waveform, NO 3D); right form column on `--surface-1`. States per screen: default / field error / submitting (button spinner→skeleton) / success → redirect. Login: email, password, show-password, forgot link, divider, OAuth buttons (visual only), signup link. Signup: name, email, password + live strength meter (Meter component), terms note. Forgot: email → "check your inbox" confirmation state with resend (60s cooldown timer). All labels mono uppercase, full keyboard flow, inline validation on blur.

### Dashboard
Topbar h1 "Welcome back" + date in mono tertiary. Layout: 2-col (2fr/1fr). Left: two FeatureCards (Speech Companion — "Practice real-world communication."; Sign Translator — "Translate signs through your camera.") each with icon, mini visualization (waveform / trajectory), arrow affordance, hover lift. Below: RecommendedPracticeCard (scenario, reason, meter, accent Start button, `DEMO DATA`). Right: ProgressPanel (RingMeter weekly goal, streak count in mono, 12-week mini heatmap) + RecentPractice (3 sessions) + ActivityList. Empty states designed: "No sessions yet — your first practice takes three minutes." with CTA. Everything spacious; no KPI card rows.

### Companion: Scenario select → Practice → Feedback
**Select:** ScenarioGrid of 5 (4 + Custom with "describe your own situation" input), each card icon + title + difficulty meter (from mock) + last-practiced mono line. Header: overline "SPEECH COMPANION", h2 "Choose your scenario", body line "Practice at your pace. InSign learns which situations are hardest for you."
**Practice:** full-width stage on `--surface-1`, r-xl. Center: MicOrb (120px, r-full, idle = surface-2 + hairline; armed = amber ring 300ms pulse; recording = `--state-recording` dot + expanding ring). Above: waveform live strip. Below: RecordingTimer (mono, 00:00) + TransportControls (Start accent → Stop recording-red + Cancel ghost). Status line mono: `READY — LISTENING — PAUSED — PROCESSING`. Scenario + "session 4 of 5 this week" micro line top-left. Accessibility: every control labeled, live region announces state changes.
**Feedback:** header "Session complete" + scenario chip. 2-col report: PaceMeter (words/min + band label), PauseTimeline (horizontal strip marking long pauses, tooltip), DifficultMomentsList (timestamped rows: quote, replay icon, one-line observation), SessionNotes (2–3 neutral sentences — e.g. "Longest pause before your second key point. Next Interview session will start with shorter prompts." — no medical claims), overall RingMeter, actions: Practice again / Back to dashboard / Start recommended. Top of panel: `DEMO DATA` badge — this screen is explicitly placeholder AI.

### Translator: Camera → Result
**Camera:** CameraStage (r-xl, 16:9, `--ink-1000` letterbox) with LandmarkOverlay (21-point hand skeleton: 1px hairline bones, 3px joint dots, accent on fingertips), TrajectoryOverlay (last ~1.5s fingertip path: raw gray + smoothed amber, exactly the chapter-07 language), corner brackets like a camera viewfinder. Left rail: TrackingStatus (dot + label: SEARCHING / TRACKING / HOLD STEADY / RECOGNIZED). Bottom bar: RecognitionPanel (large text output `h1`-scale, SpeakerButton, ResetButton, CopyButton) + TranslationHistory (last 5 chips) + camera/mic toggles. Empty/no-camera states: designed panel with icon + retry. Under all of it: `DEMO DATA` badge — mock landmarks/mock recognition until CV integrates.
**Demo route:** the chapter-07 visualization as a standalone page with step controls (Raw / Smoothed / Recognized) and scrubber — built for the judge walkthrough.

### Progress page
AdaptivePlanPanel (mirrors chapter 05: current difficulty per scenario + recommended next, with "why this?" expandable), HistoryCalendar (12-week heatmap, hairline grid, amber intensity — accessibility: also table of values), SessionTable (date, scenario, duration, focus note; sortable, mono numerics). All mock.

### Settings
Sections: Audio & camera (device selects, test buttons), Appearance (text size stepper: default/large/xl — applies `data-text-scale` on `<html>`), Motion (Reduce motion toggle mirroring OS setting), Privacy ("Practice data stays on this device in demo mode" note), About (version, hackathon build, demo-data notice). Every control ≥44px, labeled.

### 404
Centered: overline "404", statement "This page hasn't learned to exist yet.", ghost button home. On-brand, one joke max.
