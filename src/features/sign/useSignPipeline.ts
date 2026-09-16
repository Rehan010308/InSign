import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from '../../lib/sign/useCamera';
import { useHandLandmarker } from '../../lib/sign/useHandLandmarker';
import { LandmarkSmoother, type LandmarkFrame } from '../../lib/sign/kalman';
import { FeatureWindow } from '../../lib/sign/featureWindow';
import { defaultClassifier, type Classification } from '../../lib/sign/classifier';
import { SIGN_LABELS, type SignId } from '../../lib/sign/classifierTemplates';
import { createContextState, decide, recordEmission, type ContextDecision } from '../../services/contextEngine';
import { drawOverlay, drawTrace, overlayColors, type TracePoint } from './LandmarkOverlay';
import type { RecognizedSign } from '../../types';

/* ---------------------------------------------------------------- tuneables */
const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
/** classify every N processed frames — ~6 classifications per second */
const CLASSIFY_EVERY = 5;
/**
 * How long one answer has to stand before it is committed, and across how many
 * classifications.
 *
 * At 30fps with a classification every 5 frames there are about six answers a
 * second, so 500ms and 4 agreements together mean roughly two thirds of a
 * second of consistent evidence from two independent measures — a time one and
 * a count one. Neither alone is enough: a burst of classifications can satisfy
 * a count quickly, and a slow frame rate can satisfy a clock with two answers.
 */
const HOLD_MS = 500;
const HOLD_AGREEMENTS = 4;
/**
 * A single classification that disagrees does not reset the hold — the detector
 * blinks. Two in a row does.
 */
const HOLD_GRACE = 1;
/** the same sign will not fire twice inside this window */
const REPEAT_DEBOUNCE_MS = 1500;
/**
 * How long the hand may be missing before the temporal window is thrown away.
 * MediaPipe drops the odd frame on a normal session; clearing 1.2s of context
 * every time it does meant the classifier spent much of its life re-filling the
 * window and never reaching MIN_FRAMES.
 */
const HAND_GAP_TOLERANCE_MS = 260;
/** how many palm positions the RAW vs STABILIZED trace keeps */
const TRACE_POINTS = 90;

export type TrackingChip =
  | { tone: 'idle' | 'live' | 'warn'; text: string };

/**
 * What the recognizer currently thinks, separately from what it has committed.
 *
 * Keeping these apart is the fix for the output flickering between signs: the
 * per-window answer is allowed to move around, but the recognised output only
 * changes when a candidate has actually held.
 */
export interface SignCandidate {
  sign: SignId | null;
  confidence: number;
  /** 0–1 progress towards being committed */
  stability: number;
  status: 'idle' | 'uncertain' | 'holding' | 'committed';
}

const IDLE_CANDIDATE: SignCandidate = { sign: null, confidence: 0, stability: 0, status: 'idle' };

export interface SignPipeline {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** the RAW vs STABILIZED trajectory strip; drawn from the same landmark data */
  traceRef: React.RefObject<HTMLCanvasElement | null>;
  cameraState: ReturnType<typeof useCamera>['state'];
  cameraError: ReturnType<typeof useCamera>['error'];
  landmarkerState: ReturnType<typeof useHandLandmarker>['state'];
  landmarkerError: ReturnType<typeof useHandLandmarker>['error'];
  delegate: 'GPU' | 'CPU' | null;
  usedCdn: boolean;
  running: boolean;
  /** true once Stop or Save has frozen recognition */
  frozen: boolean;
  chip: TrackingChip;
  decision: ContextDecision | null;
  candidate: SignCandidate;
  candidates: Classification[];
  tokens: RecognizedSign[];
  handsInView: number;
  /** how much the Kalman filter moved the landmarks this frame, in pixels of image */
  jitterReduction: number;
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
  const traceRef = useRef<HTMLCanvasElement | null>(null);

  const smoother = useRef(new LandmarkSmoother());
  /** the other hand gets its own filter bank; the two must not share state */
  const secondSmoother = useRef(new LandmarkSmoother());
  const windowRef = useRef(new FeatureWindow());
  const contextRef = useRef(createContextState());
  const rafRef = useRef(0);
  const runningRef = useRef(false);
  const lastFrameAt = useRef(0);
  const frameCount = useRef(0);
  const sessionStart = useRef(0);
  const holdRef = useRef<{ sign: SignId | null; since: number; agreements: number; misses: number }>(
    { sign: null, since: 0, agreements: 0, misses: 0 }
  );
  const lastHandAt = useRef(0);
  const trackedHand = useRef<string | null>(null);
  const aspectRef = useRef(1);
  /**
   * Bumped by stop() and clear(). A classification that was already in flight
   * resolves against the epoch it started in, so nothing that the camera saw
   * before Stop can land on the strip after it.
   */
  const epochRef = useRef(0);
  /** true from the moment Stop or Save is pressed until the session restarts */
  const frozenRef = useRef(false);
  const lastEmit = useRef<{ sign: SignId | null; at: number }>({ sign: null, at: -Infinity });
  /**
   * After a sign is committed, the same sign cannot be committed again until
   * the recognizer has seen something else — the hand has to leave the sign and
   * come back. Without this a held gesture repeats itself every debounce
   * window, which is how a single wave became HELLO HELLO HELLO.
   */
  const awaitingRelease = useRef<SignId | null>(null);
  const fpsWindow = useRef<number[]>([]);
  const thresholdRef = useRef(threshold);
  const lightRef = useRef(light);
  const busyRef = useRef(false);
  /** set only by the test hook: keeps the live loop off while frames are injected */
  const suspendedRef = useRef(false);
  /** set only by the test hook: the end of the injected timeline so far */
  const injectedAt = useRef(0);
  /** palm centroid history, raw and stabilized, for the trajectory strip */
  const rawTrace = useRef<TracePoint[]>([]);
  const stableTrace = useRef<TracePoint[]>([]);

  const [running, setRunning] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const [chip, setChip] = useState<TrackingChip>({ tone: 'idle', text: 'CAMERA OFF' });
  const [decision, setDecision] = useState<ContextDecision | null>(null);
  const [candidate, setCandidate] = useState<SignCandidate>(IDLE_CANDIDATE);
  const [candidates, setCandidates] = useState<Classification[]>([]);
  const [tokens, setTokens] = useState<RecognizedSign[]>([]);
  const [handsInView, setHandsInView] = useState(0);
  const [jitterReduction, setJitterReduction] = useState(0);
  const [fps, setFps] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  useEffect(() => { thresholdRef.current = threshold; }, [threshold]);
  useEffect(() => { lightRef.current = light; }, [light]);

  const setChipIfChanged = useCallback((next: TrackingChip) => {
    setChip(prev => (prev.text === next.text && prev.tone === next.tone ? prev : next));
  }, []);

  const setCandidateIfChanged = useCallback((next: SignCandidate) => {
    setCandidate(prev => {
      if (
        prev.sign === next.sign &&
        prev.status === next.status &&
        Math.abs(prev.confidence - next.confidence) < 0.02 &&
        Math.abs(prev.stability - next.stability) < 0.05
      ) return prev;
      return next;
    });
  }, []);

  const resetRecognition = useCallback(() => {
    smoother.current.reset();
    secondSmoother.current.reset();
    windowRef.current.clear();
    holdRef.current = { sign: null, since: 0, agreements: 0, misses: 0 };
    rawTrace.current = [];
    stableTrace.current = [];
  }, []);

  /** One processed video frame: landmarks → Kalman → window → overlay. */
  const processFrame = useCallback((
    landmarks: LandmarkFrame | null,
    handCount: number,
    now: number,
    handLabel: string | null = null,
    aspect: number = aspectRef.current,
    secondary: LandmarkFrame | null = null
  ) => {
    // Frozen: Stop or Save has been pressed. The hand may keep moving; none of
    // it becomes a prediction, a token or a context update.
    if (frozenRef.current) return;

    const canvas = canvasRef.current;
    const colors = overlayColors(lightRef.current);
    aspectRef.current = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;

    if (!landmarks || landmarks.length < 21) {
      // A blink is not the end of the sign: keep the window for a moment so a
      // single dropped detection does not cost 1.2s of context.
      const gone = lastHandAt.current ? now - lastHandAt.current : Infinity;
      if (gone > HAND_GAP_TOLERANCE_MS) {
        resetRecognition();
        trackedHand.current = null;
        setDecision(null);
        setCandidateIfChanged(IDLE_CANDIDATE);
        // The hand leaving is exactly the release a repeated sign needs.
        awaitingRelease.current = null;
      }
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) drawOverlay(ctx, canvas, null, null, colors);
      }
      setHandsInView(0);
      setChipIfChanged({ tone: 'warn', text: 'NO HAND IN VIEW' });
      return;
    }

    // A different hand is a different signer's trajectory: carrying the Kalman
    // state or the window across the switch would feed the classifier a
    // sequence that no single hand ever performed.
    if (handLabel && trackedHand.current && handLabel !== trackedHand.current) {
      resetRecognition();
    }
    if (handLabel) trackedHand.current = handLabel;
    lastHandAt.current = now;

    const dt = lastFrameAt.current ? Math.min(0.2, (now - lastFrameAt.current) / 1000) : 1 / TARGET_FPS;
    const stabilized = smoother.current.push(landmarks, dt);
    const stabilizedSecond = secondary && secondary.length >= 21
      ? secondSmoother.current.push(secondary, dt)
      : null;
    if (!stabilizedSecond) secondSmoother.current.reset();
    windowRef.current.push(stabilized, now, aspectRef.current, stabilizedSecond);

    // How far the filter moved the landmarks this frame: the size of the jitter
    // it absorbed, measured rather than asserted.
    let moved = 0;
    for (let i = 0; i < 21; i++) {
      moved += Math.hypot(landmarks[i].x - stabilized[i].x, landmarks[i].y - stabilized[i].y);
    }
    setJitterReduction(moved / 21);

    // Palm centroids, raw and filtered, for the trajectory strip. Both come
    // from the same frame, so the two lines are genuinely comparable.
    rawTrace.current.push({ x: landmarks[9].x, y: landmarks[9].y });
    stableTrace.current.push({ x: stabilized[9].x, y: stabilized[9].y });
    if (rawTrace.current.length > TRACE_POINTS) rawTrace.current.shift();
    if (stableTrace.current.length > TRACE_POINTS) stableTrace.current.shift();

    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawOverlay(ctx, canvas, landmarks, stabilized, colors, true, secondary, stabilizedSecond);
      }
    }
    const trace = traceRef.current;
    if (trace) {
      const ctx = trace.getContext('2d');
      if (ctx) drawTrace(ctx, trace, rawTrace.current, stableTrace.current, colors);
    }

    setHandsInView(handCount);
    setChipIfChanged(
      handCount > 1
        ? { tone: 'live', text: 'TWO HANDS TRACKED' }
        : { tone: 'live', text: 'TRACKING' }
    );

    frameCount.current++;
    if (frameCount.current % CLASSIFY_EVERY !== 0 || busyRef.current) return;

    busyRef.current = true;
    const frames = [...windowRef.current.list];
    const epoch = epochRef.current;
    defaultClassifier
      .classify(frames)
      .then(result => {
        // This window was captured before Stop or Clear. Its answer belongs to a
        // session that has ended, so it changes nothing that the user can see.
        if (frozenRef.current || epoch !== epochRef.current) return;

        setCandidates(result);
        const d = decide(result, thresholdRef.current, contextRef.current);
        setDecision(d);

        const held = holdRef.current;
        const confident = d.kind === 'emit' && !!d.sign;

        // A different answer — even a low-confidence one — is the release a
        // repeated sign needs before it may be committed again.
        if (d.sign !== awaitingRelease.current) awaitingRelease.current = null;

        /* ---- below the gate: nothing is claimed ---- */
        if (!confident) {
          // One disagreeing classification is a blink, not a change of mind.
          if (held.sign && held.misses < HOLD_GRACE) {
            held.misses++;
          } else {
            holdRef.current = { sign: null, since: 0, agreements: 0, misses: 0 };
          }
          // A classification only happens with a hand in the window, so this is
          // "a hand doing something I cannot name", not "no hand": the honest
          // label is uncertain. Idle belongs to no hand, Stop and Clear.
          setCandidateIfChanged({
            sign: holdRef.current.sign ?? (d.kind === 'possible' ? d.sign : null),
            confidence: d.confidence,
            stability: 0,
            status: 'uncertain',
          });
          return;
        }

        /* ---- above the gate: has it held? ---- */
        // A confident answer that differs from the one being held starts its own
        // hold rather than inheriting the previous one's progress.
        if (held.sign !== d.sign) {
          holdRef.current = { sign: d.sign, since: now, agreements: 1, misses: 0 };
        } else {
          held.agreements++;
          held.misses = 0;
        }

        const current = holdRef.current;
        const byTime = (now - current.since) / HOLD_MS;
        const byCount = current.agreements / HOLD_AGREEMENTS;
        // Both measures have to be satisfied, so progress is the lower of them.
        const stability = Math.max(0, Math.min(1, Math.min(byTime, byCount)));

        if (stability < 1) {
          setCandidateIfChanged({
            sign: d.sign, confidence: d.confidence, stability, status: 'holding',
          });
          return;
        }

        /* ---- committed ---- */
        const last = lastEmit.current;
        const tooSoon = last.sign === d.sign && now - last.at < REPEAT_DEBOUNCE_MS;
        if (tooSoon || awaitingRelease.current === d.sign) {
          setCandidateIfChanged({
            sign: d.sign, confidence: d.confidence, stability: 1, status: 'committed',
          });
          return;
        }

        lastEmit.current = { sign: d.sign, at: now };
        awaitingRelease.current = d.sign;
        holdRef.current = { sign: null, since: 0, agreements: 0, misses: 0 };
        recordEmission(contextRef.current, d.sign as SignId);
        setCandidateIfChanged({
          sign: d.sign, confidence: d.confidence, stability: 1, status: 'committed',
        });
        setTokens(prev => [...prev, {
          sign: d.sign as string,
          confidence: d.confidence,
          at_ms: Math.round(now - sessionStart.current),
          context_adjusted: d.contextAdjusted,
        }]);
      })
      .catch(err => {
        if (frozenRef.current || epoch !== epochRef.current) return;
        console.error('[InSign · classifier]', err);
        setChipIfChanged({ tone: 'warn', text: 'CLASSIFIER ERROR — TRACKING PAUSED' });
      })
      .finally(() => { busyRef.current = false; });
  }, [setChipIfChanged, setCandidateIfChanged, resetRecognition]);

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
      const { landmarks, secondary, handCount, handLabel, aspect } = landmarker.detect(video, now);
      processFrame(landmarks, handCount, now, handLabel, aspect, secondary);
    } catch (err) {
      console.error('[InSign · landmarker]', err);
      setChipIfChanged({ tone: 'warn', text: 'TRACKING INTERRUPTED' });
    }
    lastFrameAt.current = now;
  }, [camera.videoRef, landmarker, processFrame, setChipIfChanged]);

  const startLoop = useCallback(() => {
    if (runningRef.current || suspendedRef.current) return;
    runningRef.current = true;
    frozenRef.current = false;
    setFrozen(false);
    setRunning(true);
    sessionStart.current = performance.now();
    lastFrameAt.current = 0;
    lastHandAt.current = 0;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const stop = useCallback(() => {
    // Freeze before anything else: from this instant no frame is processed and
    // no in-flight classification can add a token, a candidate or a context
    // update, however the hand keeps moving.
    frozenRef.current = true;
    epochRef.current++;
    runningRef.current = false;
    cancelAnimationFrame(rafRef.current);
    setFrozen(true);
    setRunning(false);
    camera.stop();
    landmarker.close();
    resetRecognition();
    trackedHand.current = null;
    awaitingRelease.current = null;
    setChipIfChanged({ tone: 'idle', text: 'CAMERA OFF' });
    setDecision(null);
    setCandidateIfChanged(IDLE_CANDIDATE);
    setCandidates([]);
    setHandsInView(0);
    setJitterReduction(0);
    setFps(0);
  }, [camera, landmarker, setChipIfChanged, setCandidateIfChanged, resetRecognition]);

  const enable = useCallback(async () => {
    // Enable (and Resume after a Stop) is an explicit intent to run again, so
    // it lifts the freeze up front rather than waiting for the loop to start.
    frozenRef.current = false;
    setFrozen(false);
    setChipIfChanged({ tone: 'idle', text: 'STARTING CAMERA' });
    await camera.enable();
    if (!camera.videoRef.current?.srcObject) return;
    setChipIfChanged({ tone: 'idle', text: 'LOADING HAND MODEL' });
    await landmarker.load();
    startLoop();
  }, [camera, landmarker, startLoop, setChipIfChanged]);

  const clear = useCallback(() => {
    epochRef.current++;
    setTokens([]);
    contextRef.current = createContextState();
    lastEmit.current = { sign: null, at: -Infinity };
    awaitingRelease.current = null;
    holdRef.current = { sign: null, since: 0, agreements: 0, misses: 0 };
    setDecision(null);
    setCandidateIfChanged(IDLE_CANDIDATE);
    setCandidates([]);
  }, [setCandidateIfChanged]);

  // Pause the whole pipeline when the tab is hidden; resume when it comes back.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        runningRef.current = false;
        cancelAnimationFrame(rafRef.current);
      } else if (camera.videoRef.current?.srcObject && !suspendedRef.current && !frozenRef.current) {
        runningRef.current = true;
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [camera.videoRef, loop]);

  // Route change or unmount: the loop stops here and the camera and the model
  // release themselves in their own hooks' cleanups.
  //
  // The freeze flag is deliberately NOT set here. In development React mounts,
  // unmounts and remounts every component once; setting it in this cleanup left
  // the remounted pipeline frozen before it had started, and nothing but a
  // successful `startLoop` would clear it. Freezing belongs to Stop.
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
      /** true once Stop/Save has frozen recognition */
      isFrozen() {
        return frozenRef.current;
      },
      /** the suite drives a session without the camera, so it arms the freeze */
      armSession() {
        frozenRef.current = false;
        lastHandAt.current = 0;
        injectedAt.current = 0;
        sessionStart.current = performance.now();
      },
      async feedFrames(
        frames: LandmarkFrame[],
        handCount = 1,
        handLabel: string | null = 'Right',
        aspect = 1,
        second: LandmarkFrame[] | null = null
      ) {
        if (!sessionStart.current) sessionStart.current = performance.now();
        // Injected frames carry a timestamp per frame, which advances far
        // faster than the wall clock they are injected on. Continuing from the
        // last injected timestamp keeps the whole injected session on ONE
        // monotonic timeline; restarting from `performance.now()` each call
        // sent time backwards between batches, which a camera never does and
        // which the window and hold logic are right not to expect.
        const base = Math.max(performance.now(), injectedAt.current);
        injectedAt.current = base + frames.length * FRAME_INTERVAL;
        for (let i = 0; i < frames.length; i++) {
          processFrame(
            frames[i], handCount, base + i * FRAME_INTERVAL, handLabel, aspect,
            second ? second[i] ?? null : null
          );
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
    traceRef,
    cameraState: camera.state,
    cameraError: camera.error,
    landmarkerState: landmarker.state,
    landmarkerError: landmarker.error,
    delegate: landmarker.delegate,
    usedCdn: landmarker.usedCdn,
    running,
    frozen,
    chip,
    decision,
    candidate,
    candidates,
    tokens,
    handsInView,
    jitterReduction,
    fps,
    durationMs,
    enable,
    stop,
    clear,
  };
}

export const signLabel = (id: string): string => SIGN_LABELS[id as SignId] ?? id.replace(/_/g, ' ');
