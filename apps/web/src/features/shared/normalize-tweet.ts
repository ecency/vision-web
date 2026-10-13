import type { Tweet as TweetData, TweetEntities } from "react-tweet/api";

function normalizeEntities(value: unknown): TweetEntities {
  const entities = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};

  return {
    hashtags: Array.isArray(entities.hashtags) ? entities.hashtags : [],
    user_mentions: Array.isArray(entities.user_mentions) ? entities.user_mentions : [],
    urls: Array.isArray(entities.urls) ? entities.urls : [],
    symbols: Array.isArray(entities.symbols) ? entities.symbols : [],
    ...(Array.isArray(entities.media) ? { media: entities.media } : {})
  };
}

export function normalizeTweet(tweet: TweetData): TweetData {
  return {
    ...tweet,
    entities: normalizeEntities(tweet.entities),
    quoted_tweet: tweet.quoted_tweet
      ? { ...tweet.quoted_tweet, entities: normalizeEntities(tweet.quoted_tweet.entities) }
      : undefined
  };
}
