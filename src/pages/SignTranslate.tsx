import { useEffect, useRef, useState } from 'react';
import { useSignPipeline, signLabel } from '../features/sign/useSignPipeline';
import { SIGN_IDS, SIGN_LABELS, TEMPLATES } from '../lib/sign/classifierTemplates';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../services/authService';
import { getPreferences, saveSignSession } from '../services/sessionService';
import RootErrorBoundary from '../components/RootErrorBoundary';
import { DEFAULT_PREFERENCES } from '../types';

function SignStage() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [threshold, setThreshold] = useState(DEFAULT_PREFERENCES.sign_confidence_threshold);
  const [saved, setSaved] = useState<string | null>(null);
  const [showVocab, setShowVocab] = useState(false);
  const pipeline = useSignPipeline(threshold, theme === 'light');
  const stageRef = useRef<HTMLDivElement>(null);
  const savedTokens = useRef(0);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    getPreferences(user.id).then(p => { if (alive) setThreshold(p.sign_confidence_threshold); });
    return () => { alive = false; };
  }, [user]);

  // Keep the overlay canvas's backing store matched to its box.
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
    const tokens = pipeline.tokens;
    pipeline.stop();
    if (user && tokens.length) {
      await saveSignSession(user.id, {
        recognized_signs: tokens,
        duration_ms: Math.round(pipeline.durationMs),
      });
      savedTokens.current = tokens.length;
      setSaved(`Saved ${tokens.length} recognised sign${tokens.length === 1 ? '' : 's'}.`);
    }
  }

  const stageIdle = pipeline.cameraState !== 'live';
  const decision = pipeline.decision;

  return (
    <div className="wrap stack-lg">
      <header>
        <p className="overline">SIGN TRANSLATOR</p>
        <h1 className="statement-sm">Your hands aren't perfect. Neither is <em className="serif">ours</em>.</h1>
        <p className="app-hint">
          Hand landmarks are detected on-device, stabilised with a Kalman filter, and matched against
          a small set of hand-authored templates. Nothing is uploaded — no video, no landmarks.
        </p>
      </header>

      <div className="row">
        <span className="badge badge-demo" data-testid="vocab-badge">
          LIMITED PROTOTYPE VOCABULARY: {SIGN_IDS.length} SIGNS
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
              <li key={t.id} style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                <span className="chip" style={{ minWidth: 110 }}>{SIGN_LABELS[t.id]}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>{t.description}</span>
              </li>
            ))}
          </ul>
          <p className="micro" style={{ marginTop: 16 }}>
            THANK YOU AND GOOD SHARE A HAND SHAPE AND PATH; WITHOUT FACE CONTEXT THEY OFTEN TIE, AND
            THE CONFIDENCE GATE THEN SHOWS NEITHER RATHER THAN GUESSING.
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
          <div className="panel">
            <div className="panel-head"><h3>Confidence</h3></div>
            <div className="conf-meter">
              <span className="conf-row micro">
                <span>TOP CANDIDATE</span>
                <span data-testid="confidence-value">
                  {pipeline.candidates[0] ? pipeline.candidates[0].confidence.toFixed(2) : '—'}
                </span>
              </span>
              <span className="bar"><i style={{ width: `${Math.round((pipeline.candidates[0]?.confidence ?? 0) * 100)}%` }} /></span>
            </div>
            <p className="micro" style={{ marginTop: 12 }}>GATE AT {threshold.toFixed(2)} · ADJUSTABLE IN SETTINGS</p>
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
              {pipeline.running ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void endSession()} data-testid="end-session">
                  End & save
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
            {saved && <p className="form-notice" role="status" style={{ marginTop: 12 }}>{saved}</p>}
          </div>
        </aside>
      </div>

      <section aria-labelledby="output-h">
        <div className="section-head">
          <p className="overline" id="output-h">RECOGNISED</p>
        </div>
        <div className="sign-strip" role="status" aria-live="polite" data-testid="sign-strip">
          {pipeline.tokens.length === 0 ? (
            <span className="sign-ghost">
              {decision?.kind === 'possible'
                ? `POSSIBLE: ${signLabel(decision.sign ?? '')}? — HOLD THE SIGN TO CONFIRM`
                : 'NOTHING RECOGNISED YET — SIGNS APPEAR HERE ONCE THEY CLEAR THE CONFIDENCE GATE'}
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
        {decision?.kind === 'possible' && pipeline.tokens.length > 0 && (
          <p className="sign-ghost" style={{ marginTop: 12 }} data-testid="possible-hint">
            POSSIBLE: {signLabel(decision.sign ?? '')}? — HOLD THE SIGN TO CONFIRM
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
