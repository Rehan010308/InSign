import { useEffect, useRef, useState } from 'react';
import { useSignPipeline, signLabel, type SignCandidate } from '../features/sign/useSignPipeline';
import { SIGN_IDS, SIGN_LABELS, TEMPLATES } from '../lib/sign/classifierTemplates';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../services/authService';
import { getPreferences, saveSignSession } from '../services/sessionService';
import RootErrorBoundary from '../components/RootErrorBoundary';
import { DEFAULT_PREFERENCES } from '../types';

/**
 * What the recognition panel says, and why.
 *
 * The rule the whole screen is built around: below the gate, nothing is
 * claimed. A candidate the classifier is unsure of is shown as a candidate and
 * named as one — it never appears as the recognised sign.
 */
function statusCopy(candidate: SignCandidate, hasCamera: boolean): { headline: string; note: string } {
  if (!hasCamera) return { headline: '—', note: 'CAMERA OFF' };
  switch (candidate.status) {
    case 'committed':
      return { headline: signLabel(candidate.sign ?? ''), note: 'STABLE' };
    case 'holding':
      return {
        headline: signLabel(candidate.sign ?? ''),
        note: 'HOLD POSITION — CONFIRMING',
      };
    case 'uncertain':
      return {
        headline: 'UNCERTAIN',
        note: candidate.sign
          ? `CLOSEST: ${signLabel(candidate.sign)} — NOT CONFIDENT ENOUGH TO COMMIT`
          : 'NOT CONFIDENT ENOUGH TO COMMIT',
      };
    default:
      return { headline: '—', note: 'WAITING FOR A SIGN' };
  }
}

function SignStage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [threshold, setThreshold] = useState(DEFAULT_PREFERENCES.sign_confidence_threshold);
  const [saved, setSaved] = useState<string | null>(null);
  const [showVocab, setShowVocab] = useState(false);
  const pipeline = useSignPipeline(threshold, theme === 'light');
  const stageRef = useRef<HTMLDivElement>(null);
  const traceWrapRef = useRef<HTMLDivElement>(null);
  const savedTokens = useRef(0);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    getPreferences(user.id).then(p => { if (alive) setThreshold(p.sign_confidence_threshold); });
    return () => { alive = false; };
  }, [user]);

  // Keep both canvases' backing stores matched to their boxes.
  useEffect(() => {
    const canvas = pipeline.canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;
    const resize = () => {
      const r = stage.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width));
      canvas.height = Math.max(1, Math.round(r.height));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [pipeline.canvasRef]);

  useEffect(() => {
    const canvas = pipeline.traceRef.current;
    const wrap = traceWrapRef.current;
    if (!canvas || !wrap) return;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width));
      canvas.height = Math.max(1, Math.round(r.height));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [pipeline.traceRef]);

  // Save the session's recognised signs when the user leaves the page.
  const tokensRef = useRef(pipeline.tokens);
  const durationRef = useRef(pipeline.durationMs);
  tokensRef.current = pipeline.tokens;
  durationRef.current = pipeline.durationMs;
  useEffect(() => () => {
    const tokens = tokensRef.current;
    if (user && tokens.length > savedTokens.current) {
      // No video and no landmarks leave the device — only the recognised signs.
      void saveSignSession(user.id, {
        recognized_signs: tokens,
        duration_ms: Math.round(durationRef.current),
      });
    }
  }, [user]);

  async function endSession() {
    // Freeze first, then save what was frozen: `stop()` blocks every further
    // frame and voids any classification still in flight, so the saved session
    // is exactly what was on screen when the button was pressed.
    const tokens = pipeline.tokens;
    const duration = pipeline.durationMs;
    pipeline.stop();
    if (user && tokens.length) {
      await saveSignSession(user.id, {
        recognized_signs: tokens,
        duration_ms: Math.round(duration),
      });
      savedTokens.current = tokens.length;
      setSaved(`Saved ${tokens.length} recognised sign${tokens.length === 1 ? '' : 's'}.`);
    }
  }

  const stageIdle = pipeline.cameraState !== 'live';
  // "Frames are flowing" is not the same as "the render loop is running": the
  // test harness drives frames with the loop paused, and the readouts below
  // describe the frames, not the loop.
  const streaming = pipeline.running || pipeline.handsInView > 0 || pipeline.jitterReduction > 0;
  const decision = pipeline.decision;
  const candidate = pipeline.candidate;
  const status = statusCopy(candidate, !stageIdle);

  return (
    <div className="wrap stack-lg">
      <header>
        <p className="overline">SIGN TRANSLATOR</p>
        <h1 className="statement-sm">Your hands aren't perfect. Neither is <em className="serif">ours</em>.</h1>
        <p className="app-hint">
          Hand landmarks are detected on-device, stabilised with a Kalman filter, and matched over
          time against a small set of hand-authored templates. A sign is only committed once it has
          held still enough, and for long enough, to be worth committing. Nothing is uploaded — no
          video, no landmarks.
        </p>
      </header>

      <div className="row">
        <span className="badge badge-demo" data-testid="vocab-badge">
          CONTROLLED PROTOTYPE VOCABULARY: {SIGN_IDS.length} SIGNS
        </span>
        <button type="button" className="link-btn micro" aria-expanded={showVocab} onClick={() => setShowVocab(v => !v)}>
          {showVocab ? 'HIDE THE VOCABULARY' : 'SHOW THE VOCABULARY'}
        </button>
        {pipeline.delegate && <span className="badge">{pipeline.delegate} DELEGATE</span>}
        {pipeline.usedCdn && <span className="badge badge-demo">MODEL LOADED FROM CDN</span>}
        {pipeline.running && <span className="badge">{pipeline.fps} FPS</span>}
      </div>

      {showVocab && (
        <div className="panel">
          <div className="panel-head"><h3>What this prototype can recognise</h3></div>
          <ul className="stack" style={{ listStyle: 'none' }}>
            {TEMPLATES.map(t => (
              <li key={t.id} style={{ display: 'flex', gap: 14, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <span className="chip" style={{ minWidth: 110 }}>{SIGN_LABELS[t.id]}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{t.description}</span>
                {t.hands === 2 && <span className="chip">TWO HANDS</span>}
              </li>
            ))}
          </ul>
          <p className="micro" style={{ marginTop: 16 }}>
            THIS IS A CONTROLLED VOCABULARY, NOT SIGN LANGUAGE TRANSLATION. THANK YOU AND GOOD SHARE A
            HAND SHAPE AND A DOWNWARD PATH, SO THEY ARE SEPARATED ONLY BY HOW FAR THE HAND TRAVELS —
            WHEN THAT IS AMBIGUOUS THE GATE SHOWS NEITHER RATHER THAN GUESSING.
          </p>
        </div>
      )}

      <div className="sign-stage-wrap">
        <div className="sign-stage" ref={stageRef} data-testid="sign-stage">
          <video ref={pipeline.videoRef} playsInline muted data-testid="sign-video" />
          <canvas ref={pipeline.canvasRef} data-testid="sign-overlay" aria-hidden="true" />

          <div className="sign-hud">
            <span className={`state-chip${pipeline.chip.tone === 'live' ? ' live' : pipeline.chip.tone === 'warn' ? ' warn' : ''}`} role="status" data-testid="tracking-chip">
              <i />{pipeline.chip.text}
            </span>
            {decision && decision.kind !== 'emit' && (
              <span className="state-chip warn" role="status" data-testid="decision-chip">
                <i />{decision.message.toUpperCase()}
              </span>
            )}
          </div>

          <div className="sign-legend" aria-hidden="true">
            <span className="legend-tag"><i />RAW LANDMARKS</span>
            <span className="legend-tag stable"><i />STABILIZED</span>
          </div>

          {stageIdle && (
            <div className="stage-empty">
              {pipeline.cameraError ? (
                <>
                  <p className="micro">CAMERA {pipeline.cameraState.toUpperCase()}</p>
                  <p style={{ maxWidth: '42ch', color: 'var(--text-secondary)' }}>
                    {pipeline.cameraError.message}
                  </p>
                  <p className="app-hint" style={{ maxWidth: '46ch' }}>{pipeline.cameraError.action}</p>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void pipeline.enable()} data-testid="retry-camera">
                    Retry
                  </button>
                </>
              ) : pipeline.landmarkerError ? (
                <>
                  <p className="micro">HAND MODEL UNAVAILABLE</p>
                  <p style={{ maxWidth: '42ch', color: 'var(--text-secondary)' }}>{pipeline.landmarkerError.message}</p>
                  <p className="app-hint" style={{ maxWidth: '46ch' }}>{pipeline.landmarkerError.action}</p>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => void pipeline.enable()}>Retry</button>
                </>
              ) : (
                <>
                  <p className="micro">CAMERA OFF</p>
                  <p style={{ maxWidth: '44ch', color: 'var(--text-secondary)' }}>
                    InSign needs the camera to see your hand. The video stays in this tab: frames are
                    processed locally and never uploaded or stored.
                  </p>
                  <button type="button" className="btn btn-primary" onClick={() => void pipeline.enable()} data-testid="enable-camera">
                    Enable camera <span className="arrow">→</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <aside className="stack">
          <div className="panel recognition" data-testid="recognition-panel">
            <div className="panel-head"><h3>Recognised</h3></div>
            <p className={`recognised-word ${candidate.status}`} data-testid="recognised-word">
              {status.headline}
            </p>
            <p className="micro" data-testid="recognised-status">{status.note}</p>

            <div className="conf-meter" style={{ marginTop: 18 }}>
              <span className="conf-row micro">
                <span>CONFIDENCE</span>
                <span data-testid="confidence-value">
                  {pipeline.candidates[0] ? pipeline.candidates[0].confidence.toFixed(2) : '—'}
                </span>
              </span>
              <span className="bar"><i style={{ width: `${Math.round((pipeline.candidates[0]?.confidence ?? 0) * 100)}%` }} /></span>
            </div>

            <div className="conf-meter" style={{ marginTop: 12 }}>
              <span className="conf-row micro">
                <span>STABILITY</span>
                <span data-testid="stability-value">{Math.round(candidate.stability * 100)}%</span>
              </span>
              <span className="bar"><i style={{ width: `${Math.round(candidate.stability * 100)}%` }} /></span>
            </div>

            <p className="micro" style={{ marginTop: 14 }}>
              GATE AT {threshold.toFixed(2)} · ADJUSTABLE IN SETTINGS
            </p>
            {pipeline.candidates.length > 1 && (
              <ul className="stack" style={{ listStyle: 'none', marginTop: 14 }}>
                {pipeline.candidates.map(c => (
                  <li key={c.sign} className="micro" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{SIGN_LABELS[c.sign]}</span><span>{c.confidence.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Session</h3></div>
            <div className="row">
              {/* Stop is offered whenever the camera is live. Tying it to the
                  animation loop would hide it if the loop ever stalled, which
                  is exactly when a user most wants to turn the camera off. */}
              {!stageIdle || pipeline.running ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void endSession()} data-testid="end-session">
                  Stop &amp; save
                </button>
              ) : (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void pipeline.enable()}>
                  {pipeline.cameraState === 'idle' ? 'Enable camera' : 'Resume'}
                </button>
              )}
              <button type="button" className="btn btn-secondary btn-sm" onClick={pipeline.clear} data-testid="clear-signs">
                Clear
              </button>
            </div>
            {pipeline.frozen && !pipeline.running && (
              <p className="micro" style={{ marginTop: 12 }} data-testid="frozen-note">
                RECOGNITION FROZEN — THE CAMERA IS RELEASED AND THE RESULT ABOVE IS FINAL
              </p>
            )}
            {saved && <p className="form-notice" role="status" style={{ marginTop: 12 }}>{saved}</p>}
          </div>
        </aside>
      </div>

      <section aria-labelledby="pipeline-h" data-testid="pipeline-strip">
        <div className="section-head">
          <p className="overline" id="pipeline-h">THE PIPELINE, LIVE</p>
          <span className="micro">
            {pipeline.handsInView === 2 ? 'TWO HANDS IN VIEW' : pipeline.handsInView === 1 ? 'ONE HAND IN VIEW' : 'NO HAND IN VIEW'}
          </span>
        </div>
        <div className="pipe-stages">
          <div className="pipe-stage">
            <p className="micro">01 · RAW MOVEMENT</p>
            <p className="stage-note">21 landmarks per frame, exactly as the detector reported them.</p>
          </div>
          <span className="pipe-arrow" aria-hidden="true">→</span>
          <div className="pipe-stage">
            <p className="micro">02 · KALMAN STABILIZATION</p>
            <p className="stage-note" data-testid="jitter-readout">
              {streaming
                ? `Absorbing ${(pipeline.jitterReduction * 1000).toFixed(1)} units of jitter per landmark, without lagging the hand.`
                : 'A constant-velocity filter per coordinate, absorbing tremor without lagging the hand.'}
            </p>
          </div>
          <span className="pipe-arrow" aria-hidden="true">→</span>
          <div className="pipe-stage">
            <p className="micro">03 · TEMPORAL CLASSIFIER</p>
            <p className="stage-note">A 1.2-second window of shape and path, not a single frame.</p>
          </div>
          <span className="pipe-arrow" aria-hidden="true">→</span>
          <div className="pipe-stage">
            <p className="micro">04 · COMMITTED SIGN</p>
            <p className="stage-note">Only after the candidate has held, above the confidence gate.</p>
          </div>
        </div>

        <div className="trace-panel">
          <div className="trace-head">
            <span className="legend-tag"><i />RAW</span>
            <span className="legend-tag stable"><i />STABILIZED</span>
            <span className="micro">SAME LANDMARK · SAME FRAMES</span>
          </div>
          <div className="trace-canvas" ref={traceWrapRef}>
            <canvas ref={pipeline.traceRef} data-testid="sign-trace" aria-hidden="true" />
            {!streaming && (
              <p className="micro trace-empty">THE TRAJECTORY APPEARS HERE ONCE THE CAMERA IS ON</p>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="output-h">
        <div className="section-head">
          <p className="overline" id="output-h">SEQUENCE</p>
        </div>
        <div className="sign-strip" role="status" aria-live="polite" data-testid="sign-strip">
          {pipeline.tokens.length === 0 ? (
            <span className="sign-ghost">
              NOTHING COMMITTED YET — SIGNS APPEAR HERE ONCE THEY HOLD ABOVE THE CONFIDENCE GATE
            </span>
          ) : (
            pipeline.tokens.map((t, i) => (
              <span key={`${t.sign}-${t.at_ms}-${i}`} className={`sign-token${t.context_adjusted ? ' adjusted' : ''}`}>
                {i > 0 && <span className="sep" aria-hidden="true">→</span>}
                {signLabel(t.sign)}
                <span className="c">{t.confidence.toFixed(2)}</span>
              </span>
            ))
          )}
        </div>
        {pipeline.tokens.length > 0 && (
          <p className="micro" style={{ marginTop: 12 }}>
            A SIGN IS ONLY ADDED AFTER IT HAS HELD; THE SAME SIGN HAS TO BE RELEASED AND MADE AGAIN
            BEFORE IT CAN REPEAT
          </p>
        )}
      </section>
    </div>
  );
}

export default function SignTranslate() {
  return (
    <RootErrorBoundary
      label="sign translator"
      fallback={(error, reset) => (
        <div className="wrap stack">
          <p className="overline">SIGN TRANSLATOR</p>
          <h1 className="statement-sm">Hand tracking stopped.</h1>
          <p className="app-hint">
            The camera has been released and the rest of InSign is unaffected. You can try again.
          </p>
          <p className="micro">{error.message}</p>
          <div className="row">
            <button type="button" className="btn btn-primary btn-sm" onClick={reset}>Try again</button>
          </div>
        </div>
      )}
    >
      <SignStage />
    </RootErrorBoundary>
  );
}
