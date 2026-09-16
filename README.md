# InSign

**Technology should adapt to how you communicate.**

InSign is an accessibility platform with two products that share one idea — the
tool adapts to the person, not the other way round.

- **Speech Companion.** Practise a scenario out loud. InSign observes pace,
  pauses, repetitions and filler words, remembers what it saw, and derives a
  practice recommendation from your own history. Observations, never scores.
- **Sign Translator.** Point your camera at a sign. Hand landmarks are detected
  on-device, stabilised with a Kalman filter so natural movement and tremor are
  absorbed rather than corrected, and matched against a small prototype
  vocabulary. You can watch the raw and stabilised landmarks at the same time.

Nothing about the intelligence here is outsourced: there is no LLM, no cloud AI
service, and no paid API at runtime. Everything after the browser's own speech
recognition runs locally in the page.

## Quickstart

```bash
npm install                    # also fetches the MediaPipe vision assets
cp .env.example .env.local     # optional — see "Supabase" below
npm run dev                    # http://localhost:5173
```

The ~37MB of MediaPipe binaries (the wasm runtime and the hand-landmarker model)
are **not** in the repository. `npm install` puts them in `public/` via
`npm run assets`: the wasm is copied out of `node_modules`, and the model is
downloaded from Google's official storage. If that download fails — offline, say
— the install still succeeds and the sign translator loads the model from the
official CDN instead, saying so in the UI. Re-run `npm run assets` once you are
online to get the local copy back.

Without Supabase credentials the app runs in **local demo mode**: accounts and
sessions live in that browser's localStorage, and every screen says so. The
landing page and both products work either way.

### Supabase (the real persistence path)

1. Create a project at [supabase.com](https://supabase.com).
2. Run `supabase/migrations/0001_init.sql` in the SQL editor (or
   `supabase db push` with the CLI). It creates the schema, enables row-level
   security on every table, and adds the signup trigger.
3. Put the project URL and the **public anon key** in `.env.local`:

   ```
   VITE_SUPABASE_URL=https://<project>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon key>
   ```

   Never the service-role key — it would ship inside the browser bundle. The app
   refuses to start with one, and `npm run check:secrets` fails the build if one
   reaches `dist/`.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Typecheck (`tsc -b`) then production build to `dist/` |
| `npm run preview` | Serve the production build on port 4173 |
| `npm run typecheck` | Types only |
| `npm run test:unit` | Vitest — the pure modules (metrics, Kalman, classifier, engines) |
| `npm run test:e2e` | Playwright — five viewports, both themes |
| `npm test` | Both suites |
| `npm run check:secrets` | Scans `src/` and `dist/` for service-role keys |
| `npm run assets` | Puts the MediaPipe wasm + model in `public/` (runs on install) |
| `npm run static` | Serves the original zero-dependency `site/` for reference |

## Permissions the app asks for, and why

| Permission | When | Why | If you say no |
| --- | --- | --- | --- |
| Microphone | Only when you press Start on a speech session | To transcribe what you say through the browser's speech recognition | Type your transcript instead — the whole analysis pipeline still runs |
| Camera | Only when you press "Enable camera" on the sign page | To detect hand landmarks in the browser | The sign page explains how to re-enable it; the rest of InSign is unaffected |

No video is ever uploaded, stored or sent anywhere. Landmarks are not stored
either — a saved sign session contains only the recognised signs, their
confidences and the session length.

## Honest limitations

These are real and they are stated in the product UI as well as here.

- **The sign vocabulary is 8 signs:** HELLO, THANK YOU, YES, NO, HELP, PLEASE,
  SORRY, GOOD. It is a prototype vocabulary, permanently badged as such in the
  interface.
- **The classifier is template matching, not a trained model.** Shapes and
  motions are hand-authored from a canonical hand model (see
  `docs/classifier.md`). It has not been validated against real signers, and it
  fails by saying "movement unclear" rather than by guessing.
- **THANK YOU and GOOD are genuinely ambiguous here.** They share a hand shape
  and a downward path, and a hand-only pipeline has no face to anchor them to.
  When they tie, the confidence gate shows neither.
- **Browser speech recognition is not local.** Chrome and Edge may send audio to
  the browser vendor's service. Everything after the transcript — metrics,
  pattern detection, recommendations — runs in the page. Firefox and Safari have
  no Web Speech support, so those browsers get the typed-transcript path.
- **Pauses in a typed transcript come from marks you type** (`...` or `—`),
  because typed text carries no audio timing. The UI says so next to the field.
- **Personalization needs evidence.** It refuses to claim a pattern with fewer
  than three sessions of the same scenario in the last 14 days, and says so.

## Documentation

- `docs/architecture.md` — module map and both pipelines end to end
- `docs/database.md` — schema, RLS and the reasoning behind them
- `docs/classifier.md` — the vocabulary, the template format, the confidence
  maths, and exactly how to swap in a trained model
- `docs/testing.md` — how the Playwright and Vitest suites are organised

## Design

Near-black `#0A0A0B` canvas, warm ivory type, one muted amber accent, hairline
borders, Geist / Geist Mono / Instrument Serif. Light mode is its own warm ivory
system rather than an inversion. The landing page is the original nine-chapter
scroll story, ported into React with its sequencers intact.

## Contact

rehan.badar0103@gmail.com
