import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional localized fallback for a single feature (e.g. the sign camera). */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Keeps a crash inside one feature from taking the app shell with it.
 * The top-level instance renders in the landing design language.
 */
export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced in the console for the developer; never shown raw to the user.
    console.error(`[InSign${this.props.label ? ' · ' + this.props.label : ''}]`, error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <main className="page app-page" id="main">
        <div className="wrap-narrow app-error-page">
          <p className="overline">SOMETHING WENT WRONG</p>
          <h1 className="statement-sm">The page stopped responding.</h1>
          <p className="lede">
            Reloading usually fixes it. If it keeps happening, send the details to{' '}
            <a href="mailto:rehan.badar0103@gmail.com">rehan.badar0103@gmail.com</a>.
          </p>
          <div className="row" style={{ marginTop: 28 }}>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <a className="btn btn-secondary" href="/">Back to the landing page</a>
          </div>
          <p className="micro app-error-detail">{error.message}</p>
        </div>
      </main>
    );
  }
}
