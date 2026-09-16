# InSign — Frontend Design Concept
**Project:** InSign — 24h university hackathon
**Role of this document:** the single source of truth for the frontend vision. Read together with docs 02–07.

---

## 1. Product thesis

> **Human communication isn't standardized. Technology shouldn't be either.**

InSign is a premium accessibility platform with two products:

1. **Speech Companion** — personalized communication practice for people who stutter. It does not judge or "fix" speech; it learns which situations and patterns are difficult *for the individual* and adapts future practice.
2. **Tremor-Tolerant Sign Translator** — computer-vision sign recognition that adapts to natural variation in human movement instead of demanding perfectly performed signs.

The visual identity must render that one sentence: **technology adapts to the person.** Every screen, every animation, every metaphor points at it.

---

## 2. The core visual idea — "The Grid and the Signal"

The entire design language is built on the tension between two materials:

### STRUCTURE — the machine
- Near-black canvas, hairline rules, rigid 12-column grid.
- Mono-spaced labels, chapter indices, tick marks, calibrated meters.
- The interface behaves like **precision instrumentation** (high-end automotive HUD / camera focus ring / audio equipment), not like an illustration.

### SIGNAL — the human
- Warm white typography with generous optical size.
- One warm accent color (signal amber) reserved for anything *live, active, or adapting*.
- Waveforms, trajectories, curved paths, soft depth.
- One italic serif word inside big statements — the "human inflection" in an otherwise machined layout.

### The rule
The signal bends the grid — never the reverse. Visually: rigid structures get *deformed by human-shaped motion* (the 3D grid waves under the cursor, the messy tremor path becomes a clean trajectory, the practice plan reshapes itself around one person). This is the product philosophy made visible, and it is what makes the site unique instead of generic.

---

## 3. Five visual pillars

1. **Instrument, not illustration.** Data displays (waveforms, meters, tracking status, timers) look like calibrated hardware readouts: mono type, tick marks, hairline rules. No decorative charts.
2. **One accent, earned.** Amber is used only where something is alive/adapting/active — a recording ring, the smoothed trajectory, the recommended practice, primary focus states. If nothing is "live" in a region, there is no accent there.
3. **Depth without glow.** Depth comes from scale, layering, shadow and parallax — not from bloom, neon borders or gradient orbs.
4. **Editorial typography.** Few words, huge type, immense whitespace. Each major statement gets exactly one emphasized (italic serif) word: *adapt*, *you*, *recognised*.
5. **Motion as meaning.** Every animation tells the adaptation story: disordered → organized, raw → stable, generic → personal. No animation exists purely for decoration.

---

## 4. Tone of voice (microcopy rules)

- Plain, confident, adult. Never cheerful-charity, never clinical, never hype.
- **Banned vocabulary:** cure, fix, overcome, suffer from, normal speech, perfect signing, accuracy percentages presented as real.
- Correct framing: *practice*, *support*, *your pace*, *adapts to you*, *recognized*.
- Demo/fake data must be visibly labeled: a small mono badge — `DEMO DATA` — on any panel showing placeholder results. No invented precision like "98.7% accuracy" anywhere, even labeled.
- Body text stays short: the site is visual, not essayistic.

---

## 5. Hard anti-patterns (explicit bans)

- Purple/blue/pink gradients, rainbow glows, gradient buttons, gradient text.
- Glowing borders on cards, neon text, floating gradient blobs, sparkle icons.
- Glassmorphism overload (one subtle blur on the navbar is the maximum).
- Rounded-corner soup: radii are systematic (see design system), not default 24px everywhere.
- Generic starfields, generic floating spheres, generic "AI neural network" node-graphs.
- Generic spinner loaders.
- Medical/charity visual clichés (puzzle pieces, hearts, hands-holding clip art).
- Dashboard clutter: no widget zoo, no KPI card rows of numbers.
- Emoji as UI icons.

---

## 6. Quality gates (checked at the end of the build)

| Question | Pass condition |
|---|---|
| Does it look like a generic AI website? | No — grid+signal identity, mono chapter labels, amber accent, no gradient soup |
| Too many gradients? | Gradients only: ≤2 subtle radial light pools on the whole landing page |
| Does everything glow? | Only the recording state and the hero accent pulses may softly glow — nowhere else |
| Too many rounded cards? | Radius scale respected; hairline-bordered rectangles dominate |
| Hero cinematic? | 3D reacts to cursor + scroll, camera moves, story reads in 10 seconds |
| 3D unique to InSign? | Scene = "The Weave" (spec in doc 05): a rigid grid bent by human waveform + a self-organizing adaptive form. Not a starfield |
| Dashboard clean? | 2 feature cards + progress column. No 3D carried into the app |
| Judge understands in 10s? | Hero name+tagline+CTAs visible instantly; both products appear with labels by section 04/06 |
| Communicates "tech adapts to user"? | Grid-bending hero, Raw→Stable scene, adaptive practice meters all enact it |

**Final bar:** premium technology product (Apple/PS5 launch energy: precision, depth, restraint), never "vibe-coded AI startup".
