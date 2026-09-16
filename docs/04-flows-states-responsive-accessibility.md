# InSign — UX Flows, States, Responsive & Accessibility
How users move through the product; every state; how it adapts to devices and abilities.

---

## 1. Primary flows

### Flow A — Visitor → Converted user
```
Landing (/)
  scroll journey 01→10 (passive cinematic; interactive moments: 03 grid, 07 raw→stable, 09 switcher)
  ├─ "Explore InSign" (hero) or "Try InSign" (finale) ──► /auth/signup
  └─ "See how it works" ──► scroll continues / /how-it-works
/auth/signup ── success ──► /dashboard (first-run)
```
First-run dashboard variant: RecommendedPracticeCard and ProgressPanel show onboarding empties ("Your adaptive plan appears after your first session") instead of mock data — returning visitors see mock data (labeled).

### Flow B — Speech practice (core loop)
```
/dashboard ─► /companion (select scenario)
  ─► /companion/practice (arm mic ─► record ─► stop/cancel)
       stop ──► /companion/feedback (placeholder report)
       cancel ──► back to scenario select (no data saved; toast "Session discarded")
  feedback ─► practice again │ start recommended │ dashboard
```
Recording guard: leaving practice screen mid-recording → confirm modal ("Discard this session?"). Timer hard cap 5:00 with auto-stop. Mic permission denied → designed empty state (icon, one sentence, "How to enable" link, retry). Processing state between stop and feedback: 1.8s skeleton with mono status line `ANALYZING SESSION…` (honest: it's simulated).

### Flow C — Sign translation
```
/dashboard ─► /translator (request camera ─► SEARCHING ─► TRACKING)
  TRACKING + recognized ──► result text in RecognitionPanel + history chip
  reset ──► clears panel │ speaker ──► (stub) │ continuous mode toggle
```
States: permission denied (designed panel + retry), camera busy, low light hint (`LOW LIGHT — MOVE TO BETTER LIGHTING` mono status), tracking lost (overlay dims, status `SEARCHING`), hold-steady (progress ring 0→1s while sign held). Demo route `/translator/demo` needs no camera — scrubber + step buttons.

### Flow D — Adaptive plan (the differentiator, shown not computed)
Progress page and chapter 05 read `lib/mock/adaptivePlan`. The UI *narrates* adaptation: meters per scenario + "recommended next" + one-line reason. Changing nothing is fine — this is presentation logic over mock data with an integration seam.

---

## 2. State matrix (design every cell)

| Component | Empty | Loading | Error | Success/Active |
|---|---|---|---|---|
| Auth form | — | submitting: button → skeleton pulse | inline field errors, shake 2px once | success → route change |
| Dashboard panels | first-run onboarding copy | Skeleton blocks (shape-matched) | panel-level retry link | mock data + DEMO badge |
| Practice | idle armed | processing `ANALYZING…` | mic denied state | recording: dot + timer |
| Feedback | — | skeleton report | — | full report |
| Camera | permission prompt | connecting spinner-less shimmer | denied/busy states | tracking overlay |
| RecognitionPanel | "Waiting for a sign…" mono hint | — | tracking-lost dim | large text + confidence |
| History/tables | "No sessions yet" + CTA | skeleton rows | — | rows |

Rule: never a bare spinner. Skeleton or narrated status line (`SEARCHING…`, `ANALYZING…`) — feels like instrumentation, sets up real backends.

---

## 3. Responsive behavior

Breakpoints: `sm 640 · md 768 · lg 1024 · xl 1280 · 2xl 1536`. Desktop is the hackathon presentation target; design desktop-first, adapt down.

| Region | Desktop (≥1024) | Tablet (768–1023) | Mobile (<768) |
|---|---|---|---|
| 3D hero | Full scene, cursor parallax, mouse-reactive | Full scene, gyro-lite drift (if permitted, else auto-motion) | **Static poster fallback**: pre-rendered frame of the scene + slow CSS drift on one layer; preserve battery/perf |
| Chapter rail | Visible right edge | Hidden | Hidden (top progress hairline instead) |
| Landing grid | 12-col, 160–200px rhythm | 8-col, 120px | single col, 96px; display type clamps to 56px floor |
| Ch.07 raw→stable | Interactive + mouse jitter | Touch-drag jitter | Auto-played loop, tap toggles RAW/STABLE |
| Ch.09 previews | Side-by-side dim-switch | Tabs | Stacked cards |
| App shell | Sidebar 240px | Sidebar collapsed 64px (icons) | Bottom tab bar (Dashboard/Companion/Translator/Progress) + topbar |
| Practice stage | Centered orb layout | same | Orb top, controls bottom-fixed, safe-area padding |
| Camera stage | 16:9 + left status rail | same | Status moves above stage; history collapses to horizontal chips |
| Tables | full table | condense columns | cards per row |
| Navbar | links inline | condensed | overlay menu |

Mobile 3D fallback renders a static SVG/canvas poster generated from the same visual language (grid + waveform) — consistent identity, zero GPU cost. Prefers-reduced-motion gets the same poster regardless of device.

---

## 4. Accessibility specification (WCAG 2.2 AA, the product must embody its own message)

- **Contrast:** all text ≥ 4.5:1 (`#F5F4F1`/`#A3A3AB` on `#0A0A0B` pass; `#6E6E76` used only ≥ 19px or non-essential). Amber `#E8A33D` on ink ≈ 9:1 — safe for text badges.
- **Keyboard:** full tab order; skip-link ("Skip to content") as first element; focus ring token everywhere; modal focus trap + Esc; chapter rail and product switcher fully keyboard operable (arrow keys); custom cursor is decorative only — never hides the real pointer's function.
- **Screen readers:** landmark structure (`header/nav/main/section/footer`), one `h1` per page, sections labelled by their statements; all telemetry/status text real text (not canvas-only); canvases (waveform, raw→stable) get `role="img"` + `aria-label` describing the state; live regions (`aria-live="polite"`) announce: recording start/stop, tracking status changes, recognized sign, toasts.
- **Reduced motion (`prefers-reduced-motion: reduce`):** global contract —
  - 3D scene → static poster; scroll pins → simple fades; magnetic buttons off; parallax off; autoplay demos off (user-triggered steps only); loops become single static frames.
  - Implemented via a `MotionProvider` (respects OS + Settings toggle) — one switch controls everything. Respect must be verifiable to judges.
- **Forms:** label + input + description + error wired via ids; errors announced (`aria-describedby`, `role="alert"`); autocomplete attributes on auth fields.
- **Targets:** ≥ 44×44px; spacing between targets ≥ 8px.
- **Captions/alternatives:** the sign translator result IS text; speaker button stub documented for later TTS integration; sign demo has text description of what it shows.
- **Text scaling:** Settings text-size option + no fixed-height text containers; layout reflows at 200% zoom without horizontal scroll.
- **Motion safety:** no flash > 3/s; recording pulse is a slow opacity breathe, not a strobe.

---

## 5. Performance & quality budgets (a 3D site must stay premium-feeling)

- Landing LCP < 2.5s desktop: hero text is HTML (not canvas); 3D canvas lazy-hydrates after first paint with poster placeholder.
- 3D: ≤ ~20k particles, capped DPR (max 1.5), `frameloop` pauses when tab hidden or chapter off-screen; pause scene entirely when scrolled past hero (visibility observer).
- Scroll: one scroll container, transform/opacity-only animations, `will-change` used sparingly; chapters unmount when far off-screen.
- Fonts: Geist + Instrument Serif + Geist Mono via `next/font`, subset, `display: swap`.
- Images/media: none external; everything drawn (SVG/canvas/3D) — no stock.
- Lighthouse (desktop): ≥ 90 performance, ≥ 95 accessibility, ≥ 95 best practices — accessibility score is part of the demo story.
