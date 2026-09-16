# InSign — Design System
Dark-first. Every token below is a contract — no random values anywhere in the product.
Implement tokens as CSS custom properties (`--ink-1000`, `--accent`, …) consumed by Tailwind config.

---

## 1. Color

### Neutrals (the whole product is built from these)
| Token | Value | Role |
|---|---|---|
| `--ink-1000` | `#0A0A0B` | Page canvas (landing + app) |
| `--surface-1` | `#111113` | Cards, panels |
| `--surface-2` | `#17171A` | Raised cards, inputs |
| `--surface-3` | `#1E1E22` | Hover / active surfaces |
| `--hairline` | `rgba(255,255,255,0.08)` | Default borders, dividers |
| `--hairline-strong` | `rgba(255,255,255,0.16)` | Hovered borders, focus edges |
| `--text-primary` | `#F5F4F1` | Warm white — headlines, primary text |
| `--text-secondary` | `#A3A3AB` | Body copy |
| `--text-tertiary` | `#6E6E76` | Overlines, captions, disabled |
| `--text-inverse` | `#0A0A0B` | Text on accent/warm-white fills |

### Accent — "signal amber" (the only accent)
| Token | Value | Role |
|---|---|---|
| `--accent` | `#E8A33D` | Live/active/adapting states only |
| `--accent-strong` | `#F2B45A` | Hover on accent elements |
| `--accent-deep` | `#C9862B` | Pressed states |
| `--accent-dim` | `rgba(232,163,61,0.14)` | Accent tint fills (≤14% alpha always) |

**Usage rule:** accent covers ≤ ~5% of any screen. Never fills large areas, never gradients from it.

### Semantic (functional only, never decorative)
| Token | Value | Role |
|---|---|---|
| `--state-recording` | `#E5484D` | Recording dot / stop button |
| `--state-success` | `#5FBF7A` | Tracking OK, saved, stable |
| `--state-warning` | `#E8A33D` | Shares accent (warning = attention = same idea) |
| `--state-danger` | `#E5484D` | Destructive, errors |

### Gradients (complete allowed list — nothing else exists)
1. Hero scene light pool: radial `rgba(232,163,61,0.10) → transparent` behind the 3D object.
2. Section 10 finale light pool: same recipe at half strength.
Plus flat vertical fades to `--ink-1000` used only to blend media/canvas edges into the background (fade masks, not visible gradients).

---

## 2. Typography

| Role | Font | Notes |
|---|---|---|
| Display / UI | **Geist** (Google Fonts; fallback Inter, system-ui) | Modern geometric grotesk — premium, not overused-AI |
| Human inflection | **Instrument Serif Italic** | Exactly one emphasized word per major statement |
| Data / labels | **Geist Mono** | Overlines, timers, telemetry, chapter indices, badges |

### Scale (desktop → mobile via clamp)
| Token | Size / line | Weight | Tracking | Usage |
|---|---|---|---|---|
| `display-1` | clamp(56px → 118px) / 0.98 | 500 | −0.035em | Hero wordmark, section 03/10 statements |
| `display-2` | clamp(40px → 72px) / 1.02 | 500 | −0.03em | Section statements |
| `h1` | clamp(32px → 48px) / 1.1 | 600 | −0.02em | Page titles (app) |
| `h2` | 28/36 | 600 | −0.015em | Card group titles |
| `h3` | 20/28 | 600 | −0.01em | Card titles |
| `body-lg` | 18/28 | 400 | 0 | Supporting paragraphs |
| `body` | 15/24 | 400 | 0 | Default |
| `label` | 13/16 mono | 500 | +0.08em | Buttons, chips, telemetry |
| `overline` | 12/16 mono | 400 | +0.14em, uppercase, tertiary | Chapter markers, eyebrows |
| `micro` | 11/14 mono | 400 | +0.06em | Demo-data badges, legal |

Rules: max 2 font weights visible per screen region (500/600 + 400); headlines never wrapped mid-word; every big statement may hold **one** italic serif word; generous whitespace is part of the type system.

---

## 3. Spacing, grid, radius, elevation

- **Base unit:** 4px. Scale: `4 8 12 16 24 32 48 64 96 128 160 200`.
- **Container:** 1240px content width (landing), 1120px (app), 24px gutters (16 mobile).
- **Landing section rhythm:** 160–200px vertical padding desktop, 96px mobile.
- **Grid:** 12 columns landing; app uses sidebar (240px, collapsible to 64px) + fluid content.

### Radius (systematic — the anti-rounded-soup rule)
| Token | Value | Usage |
|---|---|---|
| `r-sm` | 6px | Chips, tags, small buttons |
| `r-md` | 10px | Inputs, buttons |
| `r-lg` | 14px | Cards |
| `r-xl` | 20px | Large panels, modals, camera stage |
| `r-full` | 999px | Mic orb, pills, status dots only |

### Elevation (dark UI: shadow + hairline, never glow)
| Token | Value |
|---|---|
| `elev-1` | `0 1px 2px rgba(0,0,0,0.4)` |
| `elev-2` | `0 8px 24px rgba(0,0,0,0.35)` |
| `elev-3` | `0 24px 64px rgba(0,0,0,0.5)` |
| `inset-hairline` | `inset 0 0 0 1px rgba(255,255,255,0.06)` (combined with above on cards) |

### Opacity / interaction states
Hover = surface lift to `--surface-3` + border `--hairline-strong` + translateY(−2px). Active = translateY(0) scale(0.99). Disabled = 40% opacity, no shadow. All interactive targets ≥ 44×44px.

---

## 4. Core components

### Button
- **Primary:** solid `--text-primary` bg, `--text-inverse` label, `r-md`, no gradient. (Premium inverse button — this is THE CTA.)
- **Accent:** solid `--accent`, inverse label — reserved for record/stop and "Start recommended practice".
- **Secondary:** transparent, `1px --hairline` border, warm-white label; hover border-strong.
- **Ghost:** text-only tertiary; hover text-primary.
- **Destructive:** ghost with `--state-danger` label.
- Sizes: `sm` 36px / `md` 44px / `lg` 52px. Optional magnetic hover on `lg` only (see doc 05). Focus ring (below) mandatory.

### Card
`--surface-1`, `1px --hairline`, `r-lg`, `elev-1`, `inset-hairline`. Hover: border-strong + elev-2 + −2px lift (interactive cards only). **No glowing borders, ever.** Variants: `flat` (no hover), `interactive`, `media` (holds visual/demo content), `panel` (app settings/forms).

### Input / Select / Textarea
`--surface-2`, `--hairline`, `r-md`, mono `label` for the field label above (uppercase, tertiary). Focus: border `--accent` + `--accent-dim` outer ring 3px. Error: `--state-danger` border + micro message. Accessible name + description pattern required.

### Badge / Chip
Mono `micro`/`label`, `r-sm`, hairline border, transparent bg. Variants: neutral, `accent-dim` (live states), `DEMO DATA` badge (always micro, tertiary — required on all mock panels), status pills (success/danger dot + label).

### Meter (the signature data component)
Calibrated horizontal bar: 4px track `--hairline`, fill `--text-primary` (or `--accent` for "recommended"), tick marks every 20% in tertiary, mono value label right-aligned. Used for difficulty, pace, progress. Looks like an instrument, not a progress bar from a template.

### Ring meter
For circular progress (practice goal): 2px track, 2px fill, mono % centered. Used on dashboard + feedback screen.

### Modal / Sheet
Centered `r-xl` `--surface-1` elev-3, backdrop `rgba(0,0,0,0.6)` + 4px blur (max glassmorphism allowed). Focus-trapped, Esc closes. Mobile: bottom sheet.

### Tabs / Segmented control
Hairline underline (desktop) or `--surface-2` pill container (mobile/product switch). Mono labels.

### Toast
Bottom-center, `--surface-2`, hairline, auto-dismiss 4s, `role="status"`.

### Skeleton
`--surface-2` blocks with a slow (1.6s) 8%-white shimmer sweep. Never spinners.

### Focus ring (global token)
`2px solid --accent`, offset 2px, on every interactive element, always visible for keyboard users. Never `outline: none` without replacement.

---

## 5. Navigation

### Landing navbar
Two states, animated at 80px scroll:
- **Top:** transparent, wordmark left ("InSign" with a small amber square dot as logo mark), links center-right (Products, How it works, Sign in), primary button right.
- **Condensed:** `rgba(10,10,11,0.72)` + backdrop-blur 12px + bottom hairline; height shrinks 72→56px.
Mobile: full-screen overlay menu, staggered link reveal.

### Chapter rail (landing only, ≥1024px)
Fixed right edge: vertical mono indices `01…10` with 16px hairline ticks; active chapter's tick turns amber and label appears on hover. Scroll-spy driven; click scrolls. Hidden under reduced-motion? No — always available, just no smooth-scroll animation.

### App shell (NO 3D here)
Left sidebar: logo mark, nav (Dashboard, Speech Companion, Sign Translator, Progress, Settings), user chip bottom. Active item: `--accent-dim` left 2px rule + text-primary. Topbar: page title (h1), contextual actions, status area. Content on `--ink-1000`, cards on surfaces. Generous 48px padding, one column, spacious — elegance through emptiness.

### Footer (landing)
Hairline top border, 3 columns: wordmark+tagline, product links, "Built for hackathon · Demo data notice" in micro. Quiet.

---

## 6. Iconography & imagery
- **Icons:** Lucide, 1.5px stroke, 20px default, tertiary→primary on hover. No filled/duotone mixing.
- **Logo mark:** a small square split by a horizontal waveform line — the grid + signal mark. Amber on dark, ink on light.
- **Imagery:** only product-internal visualizations (waveforms, trajectories, mock UI). No stock photos of people. No illustrations of hands.
