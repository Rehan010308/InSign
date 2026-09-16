import { useEffect, useState } from 'react';
import { useAuth } from '../services/authService';
import { getPreferences, savePreferences, saveDisplayName } from '../services/sessionService';
import { useTheme } from '../hooks/useTheme';
import { DEFAULT_FILLER_WORDS, type UserPreferences } from '../types';

export default function Settings() {
  const { user, refreshDisplayName, mode } = useAuth();
  const { theme, setTheme } = useTheme();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [fillerText, setFillerText] = useState(DEFAULT_FILLER_WORDS.join(', '));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    getPreferences(user.id).then(p => {
      if (!alive) return;
      setPrefs(p);
      setFillerText(p.filler_words.join(', '));
    });
    return () => { alive = false; };
  }, [user]);

  async function persist(patch: Partial<Omit<UserPreferences, 'user_id'>>) {
    if (!user) return;
    setBusy(true);
    const next = await savePreferences(user.id, patch);
    setPrefs(next);
    setBusy(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  async function saveName() {
    if (!user) return;
    setBusy(true);
    await saveDisplayName(user.id, displayName.trim());
    refreshDisplayName(displayName.trim());
    setBusy(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  if (!prefs) return <div className="wrap"><p className="micro">LOADING SETTINGS…</p></div>;

  return (
    <div className="wrap stack-lg">
      <header>
        <p className="overline">SETTINGS</p>
        <h1 className="statement-sm">Tune it to <em className="serif">you</em>.</h1>
        <p className="app-hint">Signed in as {user?.email}. {mode === 'local' ? 'Local demo mode — these preferences live in this browser.' : ''}</p>
      </header>

      {saved && <p className="form-notice" role="status">Saved.</p>}

      <div className="panel">
        <div className="panel-head"><h3>Display name</h3></div>
        <div className="row" style={{ alignItems: 'flex-end', gap: 14 }}>
          <label className="field" style={{ flex: '1 1 260px' }}>
            <span className="field-label">NAME</span>
            <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </label>
          <button type="button" className="btn btn-secondary btn-sm" onClick={saveName} disabled={busy}>Save</button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Transcripts</h3></div>
        <label className="switch">
          <span className="switch-copy">
            <h3>Store transcripts</h3>
            <p>
              When this is off, sessions still save their metrics but the words are dropped before
              storage — the history shows "transcript not stored".
            </p>
          </span>
          <input
            type="checkbox"
            checked={prefs.store_transcripts}
            onChange={e => persist({ store_transcripts: e.target.checked })}
            data-testid="store-transcripts"
          />
        </label>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Filler words</h3></div>
        <p className="app-hint" style={{ marginBottom: 14 }}>
          These are the words counted as fillers in your sessions. Comma separated; multi-word
          phrases like "you know" work too.
        </p>
        <label className="field">
          <span className="field-label">YOUR LIST</span>
          <input
            type="text"
            value={fillerText}
            onChange={e => setFillerText(e.target.value)}
            onBlur={() => persist({
              filler_words: fillerText.split(',').map(w => w.trim()).filter(Boolean),
            })}
            data-testid="filler-words"
          />
        </label>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Sign confidence threshold</h3></div>
        <p className="app-hint" style={{ marginBottom: 14 }}>
          A sign is only shown when the classifier scores it above this. Lower it to see more
          guesses; raise it to see only confident matches.
        </p>
        <input
          type="range"
          min={0.5}
          max={0.95}
          step={0.05}
          value={prefs.sign_confidence_threshold}
          onChange={e => persist({ sign_confidence_threshold: Number(e.target.value) })}
          aria-label="Sign confidence threshold"
          data-testid="confidence-threshold"
        />
        <p className="micro" style={{ marginTop: 10 }}>
          CURRENT: {prefs.sign_confidence_threshold.toFixed(2)}
        </p>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Theme</h3></div>
        <div className="row">
          <button
            type="button"
            className={theme === 'dark' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            aria-pressed={theme === 'dark'}
            onClick={() => { setTheme('dark'); persist({ theme: 'dark' }); }}
          >
            Dark
          </button>
          <button
            type="button"
            className={theme === 'light' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            aria-pressed={theme === 'light'}
            onClick={() => { setTheme('light'); persist({ theme: 'light' }); }}
          >
            Light
          </button>
        </div>
      </div>
    </div>
  );
}
