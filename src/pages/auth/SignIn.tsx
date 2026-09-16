import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../../components/AuthLayout';
import { useAuth } from '../../services/authService';

export default function SignIn() {
  const { signIn, requestPasswordReset, mode } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const res = await signIn(email, password);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? 'That did not work. Try again.'); return; }
    navigate(decodeURIComponent(next), { replace: true });
  }

  async function onReset() {
    setError(null);
    const res = await requestPasswordReset(email);
    if (res.ok) setNotice('If that email has an account, a reset link is on its way.');
    else setError(res.error ?? null);
  }

  return (
    <AuthLayout
      overline="SIGN IN"
      title="Welcome"
      accent="back."
      lede="Your sessions, patterns and practice recommendations are waiting."
      footer={<p className="micro">NEW HERE? <Link to="/auth/signup">CREATE AN ACCOUNT</Link></p>}
    >
      <form className="form" onSubmit={onSubmit} noValidate>
        <label className="field">
          <span className="field-label">EMAIL</span>
          <input
            type="email" name="email" autoComplete="email" value={email}
            onChange={e => setEmail(e.target.value)} required
            aria-invalid={!!error} placeholder="you@example.com"
          />
        </label>
        <label className="field">
          <span className="field-label">PASSWORD</span>
          <input
            type="password" name="password" autoComplete="current-password" value={password}
            onChange={e => setPassword(e.target.value)} required aria-invalid={!!error}
          />
        </label>

        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-notice" role="status">{notice}</p>}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'} <span className="arrow">→</span>
        </button>

        <button type="button" className="link-btn micro" onClick={onReset}>
          FORGOT YOUR PASSWORD?
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
