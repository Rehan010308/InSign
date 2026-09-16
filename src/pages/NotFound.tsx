import { Link } from 'react-router-dom';
import ThemeToggle from '../components/ThemeToggle';

export default function NotFound() {
  return (
    <>
      <header id="nav" className="app-nav scrolled">
        <div className="wrap bar">
          <Link className="brand" to="/"><span className="mark" aria-hidden="true" />InSign</Link>
          <nav className="nav-links" aria-label="Primary"><ThemeToggle /></nav>
        </div>
      </header>
      <main id="main" className="page app-page">
        <div className="wrap-narrow">
          <p className="overline">404</p>
          <h1 className="statement-sm">That page isn't <em className="serif">here</em>.</h1>
          <p className="app-hint">It may have moved, or never existed.</p>
          <div className="row" style={{ marginTop: 28 }}>
            <Link className="btn btn-primary" to="/">Back to the story <span className="arrow">→</span></Link>
            <Link className="btn btn-secondary" to="/dashboard">Open the app</Link>
          </div>
        </div>
      </main>
    </>
  );
}
