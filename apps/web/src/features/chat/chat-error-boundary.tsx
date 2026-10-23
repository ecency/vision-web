"use client";

import { Component, ReactNode } from "react";
import { Button } from "@ui/button";
import { Esie } from "@ui/esie";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Chat error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md space-y-4 rounded-lg border border-[--border-color] bg-[--surface-color] p-6 text-center">
            <Esie placement="error" className="mx-auto" />
            <h2 className="text-lg font-semibold text-[--text-color]">
              Something went wrong
            </h2>
            <p className="text-sm text-[--text-muted]">
              The chat encountered an unexpected error. Please try reloading the page.
            </p>
            {this.state.error && (
              <details className="text-left">
                <summary className="cursor-pointer text-xs text-[--text-muted] hover:text-[--text-color]">
                  Error details
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-[--background-color] p-2 text-xs text-[--text-muted]">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex gap-2 justify-center">
              <Button
                appearance="primary"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
              >
                Reload page
              </Button>
              <Button
                appearance="gray-link"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                }}
              >
                Try again
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
