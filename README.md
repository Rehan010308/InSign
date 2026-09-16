# InSign — Frontend Prototype

**Technology should adapt to how you communicate.**

A calm, cinematic landing experience for InSign — thin flowing signal lines drifting across a near-black canvas, editorial typography with a single italic accent word, and one idea per screen. Built as a nine-chapter scroll story:

| Chapter | Content |
|---|---|
| 01 InSign | Hero — the four-line statement over the signal-line background |
| 02 The Idea | Standard vs human communication contrast + philosophy lines |
| 03 Speech | Speech Companion intro, live waveform, scenario list |
| 04 Adaptation | Minimal sparklines: pace, pauses, confidence over time |
| 05 Sign | Sign Translator intro — movement, tolerated |
| 06 Movement | Raw → Stabilized → Recognized animated sequence |
| 07 Technology | Five simple steps: camera → landmarks → stabilization → temporal recognition → sign |
| 08 Philosophy | "Human communication isn't standardized. Technology shouldn't be either." |
| 09 Contact | rehan.badar0103@gmail.com — prominently clickable |

No frameworks, no build step, no npm install. Zero dependencies — the background and visualizations are lightweight 2D canvas/SVG animations designed to run smoothly at 60 FPS, with still moments between sections.

## Run it

**Option A — double-click** `site/start.bat` (Windows), then open http://localhost:4173

**Option B — npm, from the project root:**
```bash
npm start          # or: npm run dev
```

**Option C — from a terminal:**
```bash
cd site
node server.js        # default port 4173, or: node server.js 3000
```

If the port is busy, the server automatically picks the next free one and tells you.

## Design language

- **Palette:** near-black `#0A0A0B` canvas, warm ivory `#F5F4F1` type, one muted amber `#E8A33D` accent, soft grays between. Nothing else.
- **Background:** ~10 thin signal lines undulating slowly, with occasional traveler particles — supports the typography, never competes with it.
- **Motion:** smooth masked text reveals, gentle fade+translate section entrances, subtle parallax on visual panels, magnetic CTAs. Reduced-motion users get a static, fully readable page.
- **Type:** Geist (UI), Instrument Serif italic (the one human word per statement), Geist Mono (labels, telemetry).

## Status

Frontend prototype only. Visualizations are labeled `DEMO DATA` placeholders. AI, speech recognition, sign recognition, Supabase, and auth are intentionally **not** implemented — the full implementation blueprint for Claude Code lives in `docs/`, and the design system these screens follow is specified in `docs/01–06`.
