"use client";

import React, { type ReactNode } from "react";
import { classifyError } from "../domain/errors";

interface State {
  error: Error | null;
}

/**
 * Uncaught-render fallback. React's built-in ErrorBoundary primitive via
 * `getDerivedStateFromError` + `componentDidCatch`. Does NOT catch async
 * errors — those go through `useShellErrors`. This is
 * only for a component that threw during render, which today should never
 * happen but is cheap insurance.
 */
export default class ShellErrorBoundary extends React.Component<
  { children: ReactNode },
  State
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const fsErr = classifyError(error);
    console.error("[shell-boundary]", fsErr, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          data-testid="shell-error-boundary"
          className="fixed inset-0 z-50 flex items-center justify-center bg-red-50 text-red-900"
        >
          <div className="max-w-lg rounded border border-red-300 bg-white p-6 shadow">
            <h2 className="mb-2 text-lg font-semibold">Something went wrong</h2>
            <p className="mb-3 text-sm text-red-800">
              {this.state.error.message}
            </p>
            <button
              type="button"
              onClick={this.reset}
              className="rounded border border-red-300 px-3 py-1 text-sm hover:bg-red-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
