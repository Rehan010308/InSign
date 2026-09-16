import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import ModeBanner from './ModeBanner';
import RootErrorBoundary from './RootErrorBoundary';
import { useAuth } from '../services/authService';

const LINKS = [
  { to: '/dashboard', label: 'DASHBOARD' },
  { to: '/app/speech', label: 'SPEECH' },
  { to: '/app/sign', label: 'SIGN' },
  { to: '/app/speech/history', label: 'HISTORY' },
  { to: '/settings', label: 'SETTINGS' },
];

export default function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    // The app routes stay calm: no signal background behind them.
    document.body.classList.add('in-app');
    return () => document.body.classList.remove('in-app');
  }, []);

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header id="nav" className="app-nav scrolled">
        <div className="wrap bar">
          <Link className="brand" to="/dashboard"><span className="mark" aria-hidden="true" />InSign</Link>
          <button
            type="button"
            className="app-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="app-nav-links"
            onClick={() => setMenuOpen(o => !o)}
          >
            {menuOpen ? 'CLOSE' : 'MENU'}
          </button>
          <nav
            className={`nav-links app-links${menuOpen ? ' open' : ''}`}
            id="app-nav-links"
            aria-label="Application"
          >
            {LINKS.map(l => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === '/app/speech'}
                className={({ isActive }) => (isActive ? 'app-link active' : 'app-link')}
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </NavLink>
            ))}
            <ThemeToggle />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={async () => { await signOut(); navigate('/'); }}
            >
              Sign out
            </button>
          </nav>
        </div>
      </header>

      <main id="main" className="page app-page">
        <ModeBanner />
        <RootErrorBoundary label={user?.email}>
          <Outlet />
        </RootErrorBoundary>
      </main>

      <footer className="app-footer">
        <div className="wrap frow">
          <p className="ftag">InSign — technology should adapt to how you communicate.</p>
          <a className="fmail" href="mailto:rehan.badar0103@gmail.com">REHAN.BADAR0103@GMAIL.COM</a>
        </div>
      </footer>
    </>
  );
}
