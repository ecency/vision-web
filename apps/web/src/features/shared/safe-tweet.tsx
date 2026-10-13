"use client";

import { Component, ReactNode } from "react";
import dynamic from "next/dynamic";
import { TweetFallback } from "./safe-tweet-fallback";

// Lazy-load the client renderer. The .catch covers chunk-load failures;
// render-time throws are handled by the error boundary below.
const Tweet = dynamic<{ id: string }>(
  () =>
    import("./normalized-tweet")
      .then((m) => ({ default: m.NormalizedTweet }))
      .catch((error) => {
        console.error("Failed to load react-tweet component:", error);
        return { default: TweetFallback };
      }),
  { ssr: false }
);

interface BoundaryProps {
  id: string;
  children: ReactNode;
}

class TweetErrorBoundary extends Component<BoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Expected, handled case — not a crash: react-tweet throws inside its own
    // render when X's syndication payload is incomplete (the tweet is deleted /
    // protected / age-restricted, or a field it iterates is absent). We already
    // degrade to a "view on X" link, so log a single quiet warning instead of an
    // error + component stack that looks like a real failure (and inflates Sentry).
    console.warn(`[SafeTweet] tweet ${this.props.id} unavailable; showing fallback link (${error.message})`);
  }

  render() {
    return this.state.hasError ? <TweetFallback id={this.props.id} /> : this.props.children;
  }
}

/**
 * Tweet renderer with a chunk-load fallback and a render error boundary.
 * Used as the renderer's `TwitterComponent` and in post enhancements.
 */
export function SafeTweet({ id }: { id: string }) {
  return (
    <TweetErrorBoundary key={id} id={id}>
      <Tweet id={id} />
    </TweetErrorBoundary>
  );
}
