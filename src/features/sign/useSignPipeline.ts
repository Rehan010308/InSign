import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from '../../lib/sign/useCamera';
import { useHandLandmarker } from '../../lib/sign/useHandLandmarker';
import { LandmarkSmoother, type LandmarkFrame } from '../../lib/sign/kalman';
import { FeatureWindow } from '../../lib/sign/featureWindow';
import { defaultClassifier, type Classification } from '../../lib/sign/classifier';
import { SIGN_LABELS, type SignId } from '../../lib/sign/classifierTemplates';
import { createContextState, decide, recordEmission, type ContextDecision } from '../../services/contextEngine';
import { drawOverlay, overlayColors } from './LandmarkOverlay';
import type { RecognizedSign } from '../../types';

/* ---------------------------------------------------------------- tuneables */
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
/** classify every N processed frames — ~6 classifications per second */
const CLASSIFY_EVERY = 5;
/** the decision has to stay the same this long before it is emitted */
const HOLD_MS = 400;
/** the same sign will not fire twice inside this window */
const REPEAT_DEBOUNCE_MS = 1500;

export type TrackingChip =
  | { tone: 'idle' | 'live' | 'warn'; text: string };

export interface SignPipeline {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  cameraState: ReturnType<typeof useCamera>['state'];
  cameraError: ReturnType<typeof useCamera>['error'];
  landmarkerState: ReturnType<typeof useHandLandmarker>['state'];
  landmarkerError: ReturnType<typeof useHandLandmarker>['error'];
  delegate: 'GPU' | 'CPU' | null;
  usedCdn: boolean;
  running: boolean;
  chip: TrackingChip;
  decision: ContextDecision | null;
  candidates: Classification[];
  tokens: RecognizedSign[];
  fps: number;
  durationMs: number;
  enable: () => Promise<void>;
  stop: () => void;
  clear: () => void;
}

/**
 * Wires the whole sign pipeline together and keeps it off the React render
 * path: video frames, landmarks and the temporal window all live in refs, and
 * state only changes when the tracking chip or the recognised output changes.
 */
export function useSignPipeline(threshold: number, light: boolean): SignPipeline {
  const camera = useCamera();
  const landmarker = useHandLandmarker();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const smoother = useRef(new LandmarkSmoother());
  const windowRef = useRef(new FeatureWindow());
  const contextRef = useRef(createContextState());
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const lastFrameAt = useRef(0);
  const frameCount = useRef(0);
  const sessionStart = useRef(0);
  const holdRef = useRef<{ sign: SignId | null; since: number }>({ sign: null, since: 0 });
  const lastEmit = useRef<{ sign: SignId | null; at: number }>({ sign: null, at: -Infinity });
  const fpsWindow = useRef<number[]>([]);
  const thresholdRef = useRef(threshold);
  const lightRef = useRef(light);
  const busyRef = useRef(false);
  /** set only by the test hook: keeps the live loop off while frames are injected */
  const suspendedRef = useRef(false);

  const [running, setRunning] = useState(false);
  const [chip, setChip] = useState<TrackingChip>({ tone: 'idle', text: 'CAMERA OFF' });
  const [decision, setDecision] = useState<ContextDecision | null>(null);
  const [candidates, setCandidates] = useState<Classification[]>([]);
  const [tokens, setTokens] = useState<RecognizedSign[]>([]);
  const [fps, setFps] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  useEffect(() => { thresholdRef.current = threshold; }, [threshold]);
  useEffect(() => { lightRef.current = light; }, [light]);

  const setChipIfChanged = useCallback((next: TrackingChip) => {
    setChip(prev => (prev.text === next.text && prev.tone === next.tone ? prev : next));
  }, []);

  /** One processed video frame: landmarks → Kalman → window → overlay. */
  const processFrame = useCallback((landmarks: LandmarkFrame | null, handCount: number, now: number) => {
    const canvas = canvasRef.current;
    const colors = overlayColors(lightRef.current);

    if (!landmarks) {
      smoother.current.reset();
      windowRef.current.clear();
      holdRef.current = { sign: null, since: 0 };
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) drawOverlay(ctx, canvas, null, null, colors);
      }
      setChipIfChanged({ tone: 'warn', text: 'NO HAND IN VIEW' });
      setDecision(null);
      return;
    }

    const dt = lastFrameAt.current ? Math.min(0.2, (now - lastFrameAt.current) / 1000) : 1 / TARGET_FPS;
    const stabilized = smoother.current.push(landmarks, dt);
    windowRef.current.push(stabilized, now);

    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) drawOverlay(ctx, canvas, landmarks, stabilized, colors);
    }

    setChipIfChanged(
      handCount > 1
        ? { tone: 'live', text: 'TWO HANDS — TRACKING THE CLOSEST' }
        : { tone: 'live', text: 'TRACKING' }
    );

    frameCount.current++;
    if (frameCount.current % CLASSIFY_EVERY !== 0 || busyRef.current) return;

    busyRef.current = true;
    const frames = [...windowRef.current.list];
    defaultClassifier
      .classify(frames)
      .then(result => {
        setCandidates(result);
        const d = decide(result, thresholdRef.current, contextRef.current);
        setDecision(d);

        if (d.kind !== 'emit' || !d.sign) {
          holdRef.current = { sign: null, since: 0 };
          return;
        }

        // Hold-to-confirm: a sign has to stay the classifier's answer for
        // HOLD_MS before it is allowed on the strip.
        const held = holdRef.current;
        if (held.sign !== d.sign) {
          holdRef.current = { sign: d.sign, since: now };
          return;
        }
        if (now - held.since < HOLD_MS) return;

        const last = lastEmit.current;
        if (last.sign === d.sign && now - last.at < REPEAT_DEBOUNCE_MS) return;

        lastEmit.current = { sign: d.sign, at: now };
        holdRef.current = { sign: null, since: 0 };
        recordEmission(contextRef.current, d.sign);
        setTokens(prev => [...prev, {
          sign: d.sign as string,
          confidence: d.confidence,
          at_ms: Math.round(now - sessionStart.current),
          context_adjusted: d.contextAdjusted,
        }]);
      })
      .catch(err => {
        console.error('[InSign · classifier]', err);
        setChipIfChanged({ tone: 'warn', text: 'CLASSIFIER ERROR — TRACKING PAUSED' });
      })
      .finally(() => { busyRef.current = false; });
  }, [setChipIfChanged]);

  const loop = useCallback(() => {
    if (!runningRef.current) return;
    rafRef.current = requestAnimationFrame(loop);

    const now = performance.now();
    if (now - lastFrameAt.current < FRAME_INTERVAL) return;

    const times = fpsWindow.current;
    times.push(now);
    while (times.length && now - times[0] > 1000) times.shift();
    if (times.length % 5 === 0) setFps(times.length);

    setDurationMs(now - sessionStart.current);

    const video = camera.videoRef.current;
    if (!video) { lastFrameAt.current = now; return; }

    try {
      const { landmarks, handCount } = landmarker.detect(video, now);
      processFrame(landmarks, handCount, now);
    } catch (err) {
      console.error('[InSign · landmarker]', err);
      setChipIfChanged({ tone: 'warn', text: 'TRACKING INTERRUPTED' });
    }
    lastFrameAt.current = now;
  }, [camera.videoRef, landmarker, processFrame, setChipIfChanged]);

  const startLoop = useCallback(() => {
    if (runningRef.current || suspendedRef.current) return;
    runningRef.current = true;
    setRunning(true);
    sessionStart.current = performance.now();
    lastFrameAt.current = 0;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const stop = useCallback(() => {
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    setRunning(false);
    camera.stop();
    landmarker.close();
    smoother.current.reset();
    windowRef.current.clear();
    setChipIfChanged({ tone: 'idle', text: 'CAMERA OFF' });
    setFps(0);
  }, [camera, landmarker, setChipIfChanged]);

  const enable = useCallback(async () => {
    setChipIfChanged({ tone: 'idle', text: 'STARTING CAMERA' });
    await camera.enable();
    if (!camera.videoRef.current?.srcObject) return;
    setChipIfChanged({ tone: 'idle', text: 'LOADING HAND MODEL' });
    await landmarker.load();
    startLoop();
  }, [camera, landmarker, startLoop, setChipIfChanged]);

  const clear = useCallback(() => {
    setTokens([]);
    contextRef.current = createContextState();
    lastEmit.current = { sign: null, at: -Infinity };
    holdRef.current = { sign: null, since: 0 };
    setDecision(null);
    setCandidates([]);
  }, []);

  // Pause the whole pipeline when the tab is hidden; resume when it comes back.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        runningRef.current = false;
        cancelAnimationFrame(rafRef.current);
      } else if (camera.videoRef.current?.srcObject && !suspendedRef.current) {
        runningRef.current = true;
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [camera.videoRef, loop]);

  // Route change or unmount: the camera light must go out.
  useEffect(() => () => {
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
  }, []);

  /* --- test hook -----------------------------------------------------------
     Playwright cannot make a fake webcam form a sign, so the suite feeds
     recorded landmark frames through the real pipeline instead. This only
     injects INPUT — Kalman, the temporal window, the classifier, the confidence
     gate and the context engine are all the production code path. */
  useEffect(() => {
    const api = {
      /** Stops reading the camera so injected frames are not fighting live ones. */
      pauseLive() {
        suspendedRef.current = true;
        runningRef.current = false;
        cancelAnimationFrame(rafRef.current);
      },
      resumeLive() {
        suspendedRef.current = false;
        if (runningRef.current || !camera.videoRef.current?.srcObject) return;
        runningRef.current = true;
        rafRef.current = requestAnimationFrame(loop);
      },
      async feedFrames(frames: LandmarkFrame[], handCount = 1) {
        if (!sessionStart.current) sessionStart.current = performance.now();
        const base = performance.now();
        for (let i = 0; i < frames.length; i++) {
          processFrame(frames[i], handCount, base + i * FRAME_INTERVAL);
          // Let the async classification settle before the next frame, so the
          // hold-to-confirm and debounce logic runs exactly as it would live.
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      },
      feedNoHand() {
        processFrame(null, 0, performance.now());
      },
    };
    (window as unknown as Record<string, unknown>).__insignSignPipeline = api;
    return () => { delete (window as unknown as Record<string, unknown>).__insignSignPipeline; };
  }, [processFrame, camera.videoRef, loop]);

  return {
    videoRef: camera.videoRef,
    canvasRef,
    cameraState: camera.state,
    cameraError: camera.error,
    landmarkerState: landmarker.state,
    landmarkerError: landmarker.error,
    delegate: landmarker.delegate,
    usedCdn: landmarker.usedCdn,
    running,
    chip,
    decision,
    candidates,
    tokens,
    fps,
    durationMs,
    enable,
    stop,
    clear,
  };
}

export const signLabel = (id: string): string => SIGN_LABELS[id as SignId] ?? id.replace(/_/g, ' ');
