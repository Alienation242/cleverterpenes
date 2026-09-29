import { Component, type ErrorInfo, type ReactNode } from 'react';

/** Keeps a crash in one screen from blanking the app — the session runner lives outside React and keeps timing the pump. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[cleverTerpenes] screen crashed', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="rounded-2xl border border-critical/50 bg-critical/10 p-5 text-sm text-ink-2" role="alert">
        <div className="mb-1 text-base font-semibold text-ink">This screen hit an error</div>
        <p>{this.state.error.message}</p>
        <p className="mt-2 text-ink-3">A running session continues in the background. Switch tabs or reload the page.</p>
        <button className="mt-3 rounded-xl bg-ink px-4 py-2 font-medium text-black" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
