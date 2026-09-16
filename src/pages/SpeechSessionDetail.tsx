import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../services/authService';
import { getSpeechSession } from '../services/sessionService';
import { SCENARIO_LABELS, type SpeechSession } from '../types';

export default function SpeechSessionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [session, setSession] = useState<SpeechSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !id) return;
    let alive = true;
    getSpeechSession(user.id, id).then(s => {
      if (!alive) return;
      setSession(s);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [user, id]);

  if (loading) return <div className="wrap"><p className="micro">LOADING…</p></div>;

  if (!session) {
    return (
      <div className="wrap stack">
        <p className="overline">SESSION</p>
        <h1 className="statement-sm">That session isn't here.</h1>
        <p className="app-hint">It may have been saved to a different account or browser.</p>
        <Link className="btn btn-secondary btn-sm" to="/app/speech/history">Back to history</Link>
      </div>
    );
  }

  const seconds = Math.round(session.duration_ms / 1000);

  return (
    <div className="wrap stack-lg">
      <header>
        <p className="overline">{SCENARIO_LABELS[session.scenario].toUpperCase()} SESSION</p>
        <h1 className="statement-sm">
          {new Date(session.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </h1>
        <p className="app-hint">{seconds}s of practice.</p>
      </header>

      <div className="metrics">
        <div className="metric"><h4>PACE</h4><p className="val">{Math.round(session.words_per_minute)}</p><span className="unit">WORDS PER MINUTE</span></div>
        <div className="metric"><h4>PAUSES</h4><p className="val">{session.pause_count}</p><span className="unit">OBSERVED</span></div>
        <div className="metric"><h4>REPETITIONS</h4><p className="val">{session.repetition_count}</p><span className="unit">SOUNDS REVISITED</span></div>
        <div className="metric"><h4>FILLERS</h4><p className="val">{session.filler_count}</p><span className="unit">PATTERNS OF HESITATION</span></div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Transcript</h3></div>
        {session.transcript ? (
          <p style={{ fontSize: 16, lineHeight: 1.85 }} data-testid="detail-transcript">{session.transcript}</p>
        ) : (
          <p className="empty-state" data-testid="detail-transcript-redacted">
            This transcript was not stored — "store transcripts" was off when the session was saved.
          </p>
        )}
      </div>

      <Link className="btn btn-secondary btn-sm" to="/app/speech/history">← Back to history</Link>
    </div>
  );
}
