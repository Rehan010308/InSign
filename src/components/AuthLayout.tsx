import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';

export default function AuthLayout({
  overline, title, accent, lede, children, footer,
}: {
  overline: string;
  title: string;
  accent: string;
  lede: string;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header id="nav" className="app-nav scrolled">
        <div className="wrap bar">
          <Link className="brand" to="/"><span className="mark" aria-hidden="true" />InSign</Link>
          <nav className="nav-links" aria-label="Primary">
            <ThemeToggle />
            <Link className="btn btn-secondary btn-sm" to="/">Back to the story</Link>
          </nav>
        </div>
      </header>

      <main id="main" className="page app-page auth-page">
        <div className="auth-card">
          <p className="overline">{overline}</p>
          <h1 className="statement-sm">
            {title} <em className="serif">{accent}</em>
          </h1>
          <p className="lede auth-lede">{lede}</p>
          {children}
          <div className="auth-footer">{footer}</div>
        </div>
      </main>
    </>
  );
}
