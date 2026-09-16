import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { useAuth, validateCredentials } from '../../services/authService';

export default function SignUp() {
  const { signUp, mode } = useAuth();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const invalid = validateCredentials(email, password);
    if (invalid) { setError(invalid); return; }
    setBusy(true);
    const res = await signUp(email, password, displayName);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'That did not work. Try again.'); return; }
    if (res.needsConfirmation) {
      setNotice('Check your inbox to confirm the address, then sign in.');
      return;
    }
    navigate('/dashboard', { replace: true });
  }

  return (
    <AuthLayout
      overline="CREATE ACCOUNT"
      title="Start where"
      accent="you are."
      lede="InSign learns from your sessions. Nothing is stored until you save a session yourself."
      footer={<p className="micro">ALREADY HAVE AN ACCOUNT? <Link to="/auth/signin">SIGN IN</Link></p>}
    >
      <form className="form" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span className="field-label">NAME</span>
          <input
            type="text" name="displayName" autoComplete="name" value={displayName}
            onChange={e => setDisplayName(e.target.value)} placeholder="What should we call you?"
          />
        </label>
        <label className="field">
          <span className="field-label">EMAIL</span>
          <input
            type="email" name="email" autoComplete="email" value={email}
            onChange={e => setEmail(e.target.value)} required aria-invalid={!!error}
            placeholder="you@example.com"
          />
        </label>
        <label className="field">
          <span className="field-label">PASSWORD</span>
          <input
            type="password" name="password" autoComplete="new-password" value={password}
            onChange={e => setPassword(e.target.value)} required aria-invalid={!!error}
          />
          <span className="field-hint micro">AT LEAST 6 CHARACTERS</span>
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-notice" role="status">{notice}</p>}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'} <span className="arrow">→</span>
        </button>

        {mode === 'local' && (
          <p className="micro form-hint">
            LOCAL DEMO MODE · ACCOUNTS LIVE IN THIS BROWSER ONLY
          </p>
        )}
      </form>
    </AuthLayout>
  );
}
