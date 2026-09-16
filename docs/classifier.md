# The sign classifier

This document is deliberately blunt about what the classifier is and is not,
because the interface makes honest claims easy to keep and easy to replace.

## What it is

A **template matcher**. Ten signs, each described as a family of accepted hand
shapes plus a set of motion constraints — and, for the one two-handed sign, a
constraint on how the two hands relate. No training data, no weights, no model
file. It runs in a few hundred microseconds on the main thread.

## What it is not

It is not a trained sign-language model, and it has **not been validated against
real signers**. The shapes come from an idealised hand model; the motion
constraints come from reasoning about how each sign moves. Treat the accuracy as
unmeasured. The system's job is to be honest about that: it refuses to answer
far more readily than it guesses.

## The vocabulary

| Sign | Hand shape | Movement |
| --- | --- | --- |
| HELLO | open palm | waves side to side |
| THANK YOU | flat hand, fingers together | from the chin, forward and down |
| YES | fist | nods up and down |
| NO | index + middle extended | closes down onto the thumb |
| HELP | fist with the thumb up | lifts slightly |
| PLEASE | open palm | circles |
| SORRY | fist | circles |
| GOOD | flat hand, fingers together | forward and down, shorter than THANK YOU |
| I LOVE YOU | thumb, index and little finger out | held steady |
| MORE | **both hands** gathered to a point | fingertips tapping together |

**Known ambiguity:** THANK YOU and GOOD share a hand shape and a downward path,
so the only thing separating them is how far the hand travels. Separating them
properly needs the face as an anchor, which a hand-only pipeline does not have.
A clean performance of either names itself with the other as runner-up; anything
in between lands inside the context engine's ambiguity window and the confidence
gate then shows neither. That is the correct outcome, it is stated in the UI's
vocabulary list, and `tests/unit/classifier.test.ts` asserts it.

**Two hands.** MORE is the only two-handed template. It is scored only when a
second hand is present for most of the window, and its `handGap` constraints are
what make it a two-handed *sign* rather than two hands that happen to be in
shot. One-handed templates never read the second hand at all, so a resting hand
in frame cannot change a one-handed result — `tests/unit/classifier.test.ts`
asserts that too. Nothing beyond this vocabulary is claimed: this is a
controlled prototype set, not sign-language translation.

## The feature space

### Pose fingerprint (`normalizer.ts`)

Landmarks are first made comparable: translated so the wrist is the origin,
scaled so the wrist → middle-knuckle distance is 1, and rotated so that axis
points up. Everything below is therefore invariant to where the hand is in the
frame, how far away it is, and how it is tilted.

| Feature | Meaning |
| --- | --- |
| `thumb`…`pinky` | tip-to-wrist distance per finger, in hand-lengths |
| `curlIndex`…`curlPinky` | tip-to-own-knuckle distance — a curled finger folds back towards its MCP, which the tip-to-wrist distance understates |
| `gapIM`, `gapMR`, `gapRP` | gaps between adjacent fingertips: the profile of how spread the hand is |
| `spread` | index-tip to pinky-tip distance |
| `pinch` | thumb-tip to index-tip distance |
| `thumbOut` | thumb-tip to index knuckle — a tucked thumb sits on the palm, a raised one does not |
| `palmSide` | signed x of the pinky knuckle — **weight 0 in every template**, because it flips with handedness and guessing at it would invent precision |

The last three groups exist because of a measured failure. With only the five
tip-to-wrist distances plus `spread` and `pinch`, an open palm and a flat hand
scored 0.74 alike (they differ only in how far apart the fingers are, which
barely moves a tip-to-wrist distance), and a fist and a thumb-up fist scored
0.54 alike. One or two disagreeing features were then averaged away by the rest
— which is how a still open palm came out as GOOD at 0.55, and a thumb-up circle
came out as SORRY at 0.70.

### Combining features without averaging a violation away

`poseAgreement()` scores each feature with a Gaussian on its difference, then
combines them as a **weighted geometric mean** and multiplies by a penalty from
the single worst feature (`WORST_FEATURE_WEIGHT`, 0.5). A feature that scores
near zero therefore drags the whole agreement towards zero instead of being
outvoted. `tests/unit/normalizer.test.ts` asserts that fifteen agreeing features
cannot hide one that is badly wrong.

### Handshape families, not single points

A sign is a *family* of handshapes: real signers rest the little finger,
half-extend the thumb, and pass through intermediate shapes on the way (NO is a
handshape *changing*, so the window's representative pose is the middle of the
movement and matches neither end). Each template therefore carries several
accepted fingerprints in `poses[]` and is scored best-of. This buys tolerance
for imperfect hands **without** loosening any threshold — which matters, because
loosening thresholds is exactly what would let the confusions back in.

### Motion features (`featureWindow.ts`)

Computed over the ~1.2 s window from the **palm centroid** (wrist plus the four
knuckles), divided by the window's **median** apparent hand size. Both choices
matter: a single landmark jitters far more than the palm, and dividing each
frame by its own noisy scale amplifies detector jitter enormously, because the
centroid is an absolute position rather than a displacement. That bug once made
a waving hand read as a circle.

`pathLength`, `netX`/`netY`, `amplitudeX`/`amplitudeY`, `oscillationX`/`oscillationY`,
`poseChange`, and for two hands `handGap` (median distance between the palms)
and `handGapAmplitude` (how much that distance varied — a tap moves it, two
resting hands do not).

Turning points are counted with a zigzag detector that ignores any wobble
smaller than `MIN_TURN_SEGMENT` (0.18 hand-lengths). Tremor reverses direction
constantly but never travels; without that threshold, trembling reads as waving.

## Template format

Templates are not hand-typed coordinates. Each one names finger states, and the
fingerprint is generated by running that shape through the same normalize →
fingerprint path a live hand takes:

```ts
{
  id: 'HELP',
  description: 'Fist with the thumb up, lifting slightly.',
  shape: SHAPES.thumbUpFist,               // handModel.ts: five finger states
  poses: variants(SHAPES.thumbUpFist, { pinky: 'half' }, { index: 'half' }),
  weights: weightsFor({ thumb: 2.0, thumbOut: 2.0, curlIndex: 1.3, /* … */ }),
  poseWeight: 0.65,                        // shape vs movement
  motion: {
    netY: { max: -0.15, soft: 0.1 },       // travels upward
    oscillationY: { max: 2, soft: 1.5 },
  },
}
```

Weights are given **by feature name** (`weightsFor`), not as a positional array:
with sixteen features a positional array was a transcription error waiting to
happen, and it hid which distinction each template actually relies on.

A `Range` is `{ min?, max?, soft? }`: 1 inside the range, decaying linearly to 0
across `soft` outside it. The `soft` margin is not decoration — a margin wider
than the constraint itself means a hand that never moves still scores half way
on "must travel downward", which is precisely how a still hand read as GOOD.
Keep a defining constraint's margin well under its own magnitude.

## Confidence maths

```
poseScore    = best over poses[] of poseAgreement(pose, variant, weights)
motionScore  = geometric mean of the range scores × worst-constraint penalty
similarity   = poseScore^poseWeight · motionScore^(1 − poseWeight)
```

**The combination is multiplicative, not an average.** That is the single most
important line in this file. Under the old weighted sum, a fist doing a perfect
circle scored 0.56 for PLEASE with a hand-shape agreement of 0.01, and a fist
that never moved still scored 0.45 for SORRY on shape alone. Under a product, a
score near zero on either side takes the whole similarity with it — which is
what "the sign was not performed" should mean. `motionScore` carries the same
idea internally: a geometric mean over the constraints, then a further penalty
from the least-satisfied one, so a template with many loose constraints cannot
out-score a stricter one by having more of them agree.

Four gates, in order:

1. **Frames.** Fewer than 10 frames in the window → nothing. A glimpse is not a
   sign.
2. **Shape.** A template is only a candidate if `poseScore ≥ 0.5`. Motion alone
   must never carry a match; without this gate a loosely-specified movement plus
   a hand doing something else scored as a sign. (0.5 rather than the old 0.4
   only because the fingerprint now has the features to tell the shapes apart —
   at 0.4 a thumb-up fist still qualified as a plain fist.)
   A two-handed template additionally scores zero unless a second hand was
   present for most of the window.
3. **Quality.** `quality = max(similarity)`. Below `MIN_MATCH_QUALITY` (0.45) the
   classifier returns an **empty array** — the honest answer to "which of these
   ten is it?" is often "none of them".
4. **Share.** `confidence = quality × softmax(similarities)[i]`, capped at 0.98.

An absolute quality times a relative share is what keeps the output honest. A
hand that half-matches two templates produces two mediocre confidences, not one
confident label — and a hand doing something unknown produces nothing at all.

## The confidence gate and the context engine

`contextEngine.decide()` turns candidates into one of three outcomes:

- `emit` — the top candidate is at or above the user's threshold (default 0.75,
  adjustable in Settings)
- `possible` — between 0.55 and the threshold: shown ghosted as
  "Possible: X? — hold the sign to confirm"
- `unclear` — below that, or no candidates: "Movement unclear — try again"

When the top two are within 0.08 for three consecutive windows **and** something
has already been emitted, a small hand-authored bigram table may prefer a
candidate that forms a common sequence (HELLO → THANK YOU, PLEASE → THANK YOU,
…). The result is marked `context-adjusted` in the UI. The engine can only ever
choose among candidates the classifier produced; `tests/unit/contextEngine.test.ts`
asserts it cannot introduce a sign that was never on the table.

## Committing a sign

A single window's answer is allowed to move around; the **recognised output is
not**. `useSignPipeline` keeps a candidate separate from the committed sequence:

```
candidate → stability check → confidence check → commit
```

A candidate is committed only when it has been the answer for `HOLD_MS` (500 ms)
**and** across `HOLD_AGREEMENTS` (4) consecutive classifications. At ~30 fps
with a classification every 5 frames there are about six answers a second, so
that is roughly two thirds of a second of consistent evidence from two
independent measures — a clock and a count. Neither alone is enough: a burst of
classifications satisfies a count quickly, and a slow frame rate satisfies a
clock with two answers. One disagreeing classification is treated as a blink
(`HOLD_GRACE`); two in a row resets the hold.

Until that bar is met the UI shows the candidate as **HOLD POSITION —
CONFIRMING**, or **UNCERTAIN** below the gate, and the committed sequence does
not change. The progress towards the bar is shown as a stability percentage.

Repeats need a **release**: after a sign is committed, the same sign cannot be
committed again until the recognizer has seen something else (a different
candidate, or the hand leaving view), in addition to a 1.5 s debounce. Without
that, a single held wave became HELLO HELLO HELLO.

## Stop and Save

Pressing Stop (or Save) sets a freeze flag and bumps an epoch counter **before
anything else happens**. From that instant `processFrame` returns immediately,
and any classification already in flight resolves against the old epoch and is
discarded. No frame the camera saw before Stop can add a token, move the
candidate, change a confidence, or update the context engine afterwards. The
camera tracks are stopped and the landmarker is closed in the same call, and
both hooks also release on unmount, so leaving the route ends the camera too.
`tests/e2e/sign.spec.ts` keeps signing a different sign after Stop and asserts
the output is byte-for-byte unchanged.

## Replacing it with a trained model

The whole point of the interface. Implement:

```ts
interface SignClassifier {
  readonly name: string;
  classify(window: readonly WindowFrame[]): Promise<Classification[]>;
  // Classification: { sign: SignId; confidence: number }, sorted desc, top-k
}
```

Then change one line in `src/lib/sign/classifier.ts`:

```ts
export const defaultClassifier: SignClassifier = new MyTrainedClassifier();
```

Nothing upstream (camera, landmarks, Kalman, window) or downstream (gate,
context engine, UI, storage) needs to change. A `WindowFrame` gives you the
normalized hand, the pose fingerprint, the palm centroid and the timestamp for
every frame, which is enough to feed an LSTM/GRU or a transformer over landmark
sequences directly.

Two obligations come with the swap: keep returning an **empty array** when
nothing is plausible rather than an argmax, and update the UI's vocabulary badge
and this document to state what the model was trained on and how it was
measured.

## Tunable constants

| Constant | File | Default |
| --- | --- | --- |
| `MIN_MATCH_QUALITY` | `classifier.ts` | 0.45 |
| `MIN_POSE_SCORE` | `classifier.ts` | 0.5 |
| `MIN_FRAMES` | `classifier.ts` | 10 |
| `WORST_CONSTRAINT_WEIGHT` | `classifier.ts` | 0.5 |
| `FEATURE_SIGMA` / `WORST_FEATURE_WEIGHT` | `normalizer.ts` | 0.3 / 0.5 |
| `SOFTMAX_T` | `classifier.ts` | 0.06 |
| `WINDOW_MS` | `featureWindow.ts` | 1200 |
| `MIN_TURN_SEGMENT` | `featureWindow.ts` | 0.18 |
| `processNoise` / `measurementNoise` | `kalman.ts` | 0.2 / 0.006 |
| `AMBIGUITY_DELTA` / `AMBIGUITY_WINDOWS` | `contextEngine.ts` | 0.08 / 3 |
| `HOLD_MS` / `HOLD_AGREEMENTS` | `useSignPipeline.ts` | 500 / 4 |
| `REPEAT_DEBOUNCE_MS` | `useSignPipeline.ts` | 1500 |

The Kalman defaults were tuned against a 0.5–2 Hz hand movement carrying a 6 Hz
tremor: they cut the error against the intended trajectory by roughly half at
conversational speeds while still tracking a 2 Hz wave, and they beat an
exponential moving average at both. `tests/unit/kalman.test.ts` holds that claim.
