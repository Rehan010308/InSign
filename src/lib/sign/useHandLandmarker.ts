import { useCallback, useEffect, useRef, useState } from 'react';
import type { HandLandmarker } from '@mediapipe/tasks-vision';
import type { LandmarkFrame } from './kalman';

export type LandmarkerState = 'idle' | 'loading' | 'ready' | 'error';

export interface LandmarkerError {
  message: string;
  action: string;
}

/** Local first: the model and wasm ship with the app so a demo works offline. */
const WASM_PATH = '/mediapipe/wasm';
const MODEL_PATH = '/models/hand_landmarker.task';
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export interface HandResult {
  /** landmarks of the hand being tracked, in normalized image space (0..1) */
  landmarks: LandmarkFrame | null;
  /**
   * The other hand, when one is in view. One-handed recognition ignores it
   * completely — it exists so the two-handed template has something to score
   * and so both hands can be drawn.
   */
  secondary: LandmarkFrame | null;
  /** how many hands the detector saw this frame */
  handCount: number;
  /** 'Left' | 'Right' as the detector labelled the tracked hand, when it did */
  handLabel: string | null;
  secondaryLabel: string | null;
  /**
   * width / height of the video frame. MediaPipe normalizes x by the frame
   * width and y by its height, so on any non-square camera the same physical
   * distance is a different number on each axis. Downstream geometry has to
   * undo that before it compares a hand to anything.
   */
  aspect: number;
}

export interface UseHandLandmarker {
  state: LandmarkerState;
  error: LandmarkerError | null;
  /** 'GPU' or 'CPU' — shown in the UI so the fallback is visible, not hidden */
  delegate: 'GPU' | 'CPU' | null;
  /** true when the model had to come from the CDN instead of the local copy */
  usedCdn: boolean;
  load: () => Promise<void>;
  detect: (video: HTMLVideoElement, timestampMs: number) => HandResult;
  close: () => void;
}

/**
 * How much bigger a rival hand has to look before tracking switches to it.
 * Without hysteresis two hands at similar distance swap the tracked hand from
 * frame to frame, and the temporal window ends up holding a sequence that no
 * single hand ever performed.
 */
const SWITCH_MARGIN = 1.25;

/** Apparent size of a hand: wrist → middle-finger knuckle. */
function handSize(hand: LandmarkFrame): number {
  if (!hand || hand.length < 21) return 0;
  return Math.hypot(hand[9].x - hand[0].x, hand[9].y - hand[0].y);
}

/**
 * Picks the hand to track when more than one is visible.
 *
 * The prototype vocabulary is one-handed, so exactly one hand must reach the
 * classifier, and it must be the SAME hand for as long as it is in view:
 * the detector's ordering is not stable, so the choice is made by handedness
 * label first (stay on the hand we were already tracking) and by apparent size
 * second, with hysteresis so a near-tie does not oscillate.
 */
export function pickPrimary(
  hands: LandmarkFrame[],
  labels: Array<string | null>,
  previousLabel: string | null
): number {
  if (hands.length === 1) return 0;

  let best = 0;
  let bestSize = -Infinity;
  for (let i = 0; i < hands.length; i++) {
    const size = handSize(hands[i]);
    if (size > bestSize) { bestSize = size; best = i; }
  }

  if (previousLabel) {
    const keep = labels.indexOf(previousLabel);
    // Stay on the hand already being tracked unless the other is clearly nearer.
    if (keep >= 0 && handSize(hands[keep]) * SWITCH_MARGIN >= bestSize) return keep;
  }
  return best;
}

export function useHandLandmarker(): UseHandLandmarker {
  const [state, setState] = useState<LandmarkerState>('idle');
  const [error, setError] = useState<LandmarkerError | null>(null);
  const [delegate, setDelegate] = useState<'GPU' | 'CPU' | null>(null);
  const [usedCdn, setUsedCdn] = useState(false);
  const ref = useRef<HandLandmarker | null>(null);
  const loadingRef = useRef<Promise<void> | null>(null);
  /** handedness label of the hand currently being tracked, for stickiness */
  const trackedLabel = useRef<string | null>(null);

  const close = useCallback(() => {
    try { ref.current?.close(); } catch { /* already closed */ }
    ref.current = null;
    setState('idle');
    setDelegate(null);
  }, []);

  useEffect(() => close, [close]);

  const load = useCallback(async () => {
    if (ref.current) return;
    if (loadingRef.current) return loadingRef.current;

    const run = (async () => {
      setState('loading');
      setError(null);
      const { FilesetResolver, HandLandmarker: HL } = await import('@mediapipe/tasks-vision');

      // Local assets first; the CDN is the fallback, and the UI says when it was used.
      const sources: Array<{ wasm: string; model: string; cdn: boolean }> = [
        { wasm: WASM_PATH, model: MODEL_PATH, cdn: false },
        { wasm: CDN_WASM, model: CDN_MODEL, cdn: true },
      ];

      for (const source of sources) {
        for (const d of ['GPU', 'CPU'] as const) {
          try {
            const fileset = await FilesetResolver.forVisionTasks(source.wasm);
            const landmarker = await HL.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: source.model, delegate: d },
              runningMode: 'VIDEO',
              numHands: 2,
              minHandDetectionConfidence: 0.5,
              minHandPresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });
            ref.current = landmarker;
            setDelegate(d);
            setUsedCdn(source.cdn);
            setState('ready');
            return;
          } catch {
            // Try CPU, then the CDN copy, before giving up.
          }
        }
      }

      setError({
        message: 'The hand tracking model could not be loaded.',
        action:
          'The model ships with the app at /models/hand_landmarker.task and falls back to the official CDN. Check your connection or reinstall the app assets, then press Retry.',
      });
      setState('error');
    })();

    loadingRef.current = run;
    try {
      await run;
    } finally {
      loadingRef.current = null;
    }
  }, []);

  const detect = useCallback((video: HTMLVideoElement, timestampMs: number): HandResult => {
    const landmarker = ref.current;
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 1;
    const none: HandResult = {
      landmarks: null, secondary: null, handCount: 0, handLabel: null, secondaryLabel: null, aspect,
    };
    if (!landmarker || video.readyState < 2) return none;

    const result = landmarker.detectForVideo(video, timestampMs);
    const hands = (result.landmarks ?? []) as LandmarkFrame[];
    if (!hands.length) { trackedLabel.current = null; return none; }

    const categories = (result.handedness ?? []) as Array<Array<{ categoryName?: string }>>;
    const labels = hands.map((_, i) => categories[i]?.[0]?.categoryName ?? null);
    const idx = pickPrimary(hands, labels, trackedLabel.current);
    const hand = hands[idx];

    // A partial hand is not a hand: the whole geometry pipeline indexes fixed
    // landmarks, so an incomplete frame must not reach it.
    if (!hand || hand.length < 21) { trackedLabel.current = null; return none; }

    trackedLabel.current = labels[idx];

    // The other hand, if the detector found one and it is complete.
    let secondary: LandmarkFrame | null = null;
    let secondaryLabel: string | null = null;
    for (let i = 0; i < hands.length; i++) {
      if (i === idx) continue;
      if (hands[i] && hands[i].length >= 21) { secondary = hands[i]; secondaryLabel = labels[i]; break; }
    }

    return {
      landmarks: hand,
      secondary,
      handCount: hands.length,
      handLabel: labels[idx],
      secondaryLabel,
      aspect,
    };
  }, []);

  return { state, error, delegate, usedCdn, load, detect, close };
}
