"use client";

import { EmbeddedTweet, TweetSkeleton, useTweet } from "react-tweet";
import { TweetFallback } from "./safe-tweet-fallback";
import { normalizeTweet } from "./normalize-tweet";

export function NormalizedTweet({ id }: { id: string }) {
  const { data, error, isLoading } = useTweet(id);
  if (isLoading) return <TweetSkeleton />;
  if (error || !data) return <TweetFallback id={id} />;
  return <EmbeddedTweet tweet={normalizeTweet(data)} />;
}
