# InSign — Motion, Microinteractions & 3D Scene Design
The animation language and the signature 3D environment. Motion must always *mean* something: disordered → organized.

---

## 1. Motion system (tokens)

### Timing (cubic-bezier contracts)
| Token | Curve | Duration | Usage |
|---|---|---|---|
| `ease-out-quint` | `cubic-bezier(0.22, 1, 0.36, 1)` | — | default entrances |
| `ease-in-out-soft` | `cubic-bezier(0.65, 0, 0.35, 1)` | — | position/state changes |
| `t-fast` | — | 150ms | hovers, taps, toggles |
| `t-med` | — | 350ms | cards, panels, dropdowns |
| `t-slow` | — | 700ms | section reveals, camera moves |
| `t-cinema` | — | 1100ms | hero entrance, chapter 03 swap |
| `t-loop` | — | 4–8s | ambient loops (waveform breathe, particle drift) |

### Rules
- Animate **transform + opacity only** in scroll work (plus filter: blur ≤ 8px for depth transitions).
- Entrance pattern: 12px rise + fade + 4% scale-up, staggered 60ms per sibling, max 5 staggered items per group.
- Exit pattern: shorter (200ms), simple fade — exits never steal attention.
- One "hero motion" per viewport at a time. If two candidates, the one telling the adaptation story wins.
- Text reveals: masked line-slide (overflow hidden, y 100%→0, `t-cinema`, stagger 80ms) for display statements only; body copy gets a simple fade-up.
- Never animate: color of body text, borders on inputs while typing, layout positions in tables.

### Page transitions
Landing → app (post-auth): 500ms — current view scales to 0.98 + fades, new view rises 16px. A single horizontal hairline sweeps the screen mid-transition (the "grid line" motif) — premium, cheap to build, memorable.
Route transitions inside the app: 250ms fade + 8px rise. No cinematic transitions inside the app — it is a tool.

---

## 2. THE 3D HERO — "The Weave" (the scene is called The Weave)

**Concept:** a rigid, structured field (the grid / standardized technology) that is continuously *bent by a human waveform* (the signal / the person). One metaphor, two readings: it looks like a communication-signal field; it IS the philosophy diagram.

### Composition (deep dark space, ink-1000 fog to black)
1. **The Field (back layer, depth):** ~9,000 tiny points laid out as a subtle curved lattice — slightly warped plane receding into darkness, points 1.5px, color `#3A3A40` fading with distance. It breathes (very slow sine drift, 8s). Reads as spatial depth, not a starfield — it has *order*, rows and curvature, like machined texture.
2. **The Wave (mid layer, the signal):** 3–5 luminous curved lines (ribbon trails) crossing the field diagonally — like seismograph traces in space. Warm white at 60% opacity, 1px. Each carries a traveling pulse of amber light. They are *irregular* — organic waveform shapes, not sine waves. Where a wave passes close to the Field, nearby points lift slightly toward it (displacement) — the human signal bending the structure.
3. **The Adaptive Form (hero object, center-right):** ~700 particles bound to an abstract structure of ~12 curved spline segments — an open, breathing "shell" resembling a fragmented torus / orbit paths. Idle: segments drift apart, slightly fragmented, particles scattered along the paths (loose = untuned). Ambient slow rotation (y: 8s cycle).
4. **Light pool:** one soft amber radial glow behind the form (the allowed gradient #1) + ink fog. Vignette to pure ink at edges.

### Interaction script
- **Mouse (desktop):** camera parallax ±2.5° (lerped, 0.06 factor — heavy, expensive feel like a PS5 menu). The Adaptive Form reacts: segments nearest the cursor ray *reorganize* — particles pull 10–15% toward alignment, spline curvature eases toward smooth; when the cursor leaves, they drift back to fragment. Literally "adapts to you" on hover.
- **Click/hold:** a pulse ripples outward from the form through the Field (points brighten in a radial wave) — reward interaction, used as the hero entrance beat too.
- **Scroll (chapters 01→02):** camera dollies forward + down 15%, form drifts up-left and defocuses (blur layer), Field rotates 5° — parallax layers separate. Scene pauses fully once past chapter 02 (performance).
- **Entrance (0–1.6s on load):** Field fades in first, waves draw in (dash-offset style), form assembles from scattered particles → fragments → structure. Text reveals over it at 0.6s.
- **Reduced motion:** static poster frame (pre-rendered from the same scene: field + one wave + form) with zero animation.

### Explicitly NOT in the scene
No starfield, no floating spheres, no neural-network node graph, no neon, no bloom-heavy glow, no gradient blobs. Points are small and disciplined; glow exists only as the one light pool.

### Technical direction for Claude
React Three Fiber + drei, one `<Canvas>` dynamic-imported `ssr:false`, DPR capped 1.5, particle counts above are ceilings, `frameloop="demand"`-style pausing when off-screen/hidden. All motion of the form driven by a single "adaptation" parameter 0→1 (fragmented→aligned) so the same value can later be driven by real input (e.g., actual user movement data) — the integration seam. Poster fallback rendered to a static image/canvas for mobile & reduced motion. Keep scene code in `components/three/`, isolated from UI code.

---

## 3. Microinteractions

### Buttons
- **Magnetic hover (primary/CTA, desktop only):** pointer within 24px → button translates up to 6px toward cursor (lerp 0.15), label 2px further — subtle, expensive. Disabled under reduced motion.
- Press: scale 0.99. Primary hover: bg shifts `--text-primary` → `#FFFFFF`. Accent hover: `--accent` → `--accent-strong`.
- CTA arrow icon slides 4px right on hover.

### Cards
- Interactive: translateY(−2px) + elev-2 + border-strong (150ms). Media cards: inner visualization gains +6% brightness. A 1px hairline "sheen" never appears — no glow borders.
- ScenarioCard hover: its mini icon animates once (waveform bar dances / trajectory redraws).

### Waveform (global signature)
Idle state everywhere a waveform appears: slow 4s "breathe" (bars gently fluctuate at low amplitude, white 25%). Active (recording/demo): amber, amplitude reacts to the mic level input (mock-driven in frontend phase). This one component carries identity across landing, practice, and previews — build it as one reusable `WaveformDisplay` with `state: idle | live | static`.

### Recording ring
MicOrb armed: amber ring fades in + 300ms slow pulse. Recording: red dot + ring expands 1→1.15s loop, opacity 0.5→0. Timer digits flip with a 150ms y-slide (like a flip-clock, restrained).

### Navbar
Scroll past 80px: height 72→56, bg → rgba ink 72% + blur 12px + hairline bottom. All 300ms `ease-in-out-soft`. Logo mark's amber dot pulses once on route change (navigation feedback).

### Chapter transitions (landing)
Each chapter: overline first (mono, letter-spacing expands from 0.06em→0.14em, 600ms), statement masked-reveal next, visual last. Scroll-linked chapters (03, 07) pin: entering content fades/slides on scroll progress; pin releases with a 200ms fade. Chapter numbers on the rail fill amber as you pass.

### Cursor (desktop, optional but recommended)
8px warm-white dot + 24px trailing ring (lerp 0.2). Over interactive elements: ring scales 1.4 and shows a mono label in contexts like chapter 07 ("DRAG") / product switcher ("SWITCH"). Hidden on touch/reduced motion; native cursor always visible (dot is additive, never replaces).

### Raw → Stable interaction (chapter 07, the showpiece micro)
Auto on scroll into view: RAW path draws jittery (1s, gray), pause 300ms, STABLE path draws over it (800ms, amber), then recognition chip types on (mono, 30ms/char) + confidence meter fills. Mouse move over the canvas live-refreshes the RAW jitter; toggle forces manual replay. Recognized moment: single amber pulse across the trajectory endpoint — one glow, earned.

### Loading
No spinner anywhere. Full-page load: ink screen, wordmark fades in, one horizontal hairline draws left→right under it (900ms), then page fades in — the "grid line draws" motif as the premium loader. App panels: skeletons. Processing: narrated status lines.
