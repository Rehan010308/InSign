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
  /** how many hands the detector saw this frame */
  handCount: number;
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
 * Picks the hand to track when more than one is visible: the one closest to the
 * centre of the frame, which is almost always the one the user is signing with.
 */
function pickPrimary(hands: LandmarkFrame[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < hands.length; i++) {
    const wrist = hands[i][0];
    const d = Math.hypot(wrist.x - 0.5, wrist.y - 0.5);
    if (d < bestDist) { bestDist = d; best = i; }
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
    if (!landmarker || video.readyState < 2) return { landmarks: null, handCount: 0 };
    const result = landmarker.detectForVideo(video, timestampMs);
    const hands = (result.landmarks ?? []) as LandmarkFrame[];
    if (!hands.length) return { landmarks: null, handCount: 0 };
    const idx = hands.length === 1 ? 0 : pickPrimary(hands);
    return { landmarks: hands[idx], handCount: hands.length };
  }, []);

  return { state, error, delegate, usedCdn, load, detect, close };
}
