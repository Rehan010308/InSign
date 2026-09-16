import { Link } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { useAuth } from '../services/authService';

export default function LandingNav() {
  const { user } = useAuth();
  return (
    <header id="nav">
      <div className="wrap bar">
        <a className="brand" href="#hero"><span className="mark" aria-hidden="true" />InSign</a>
        <nav className="nav-links" aria-label="Primary">
          <a href="#speech">SPEECH</a>
          <a href="#sign">SIGN</a>
          <a href="#philosophy">PHILOSOPHY</a>
          <a href="#contact">CONTACT</a>
          <ThemeToggle />
          <Link className="btn btn-primary btn-sm magnetic" to={user ? '/dashboard' : '/auth/signup'}>
            {user ? 'Open InSign' : 'Try InSign'} <span className="arrow">→</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
