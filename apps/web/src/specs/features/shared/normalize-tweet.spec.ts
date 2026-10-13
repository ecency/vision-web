import { describe, expect, it } from "vitest";
import type { Tweet } from "react-tweet/api";
import { normalizeTweet } from "@/features/shared/normalize-tweet";

describe("normalizeTweet", () => {
  it("fills missing entity arrays in a tweet and its quote before rendering", () => {
    const malformed = {
      entities: { urls: [{ indices: [0, 3], display_url: "url" }] },
      quoted_tweet: { entities: null }
    } as unknown as Tweet;

    const normalized = normalizeTweet(malformed);
    expect(normalized.entities).toEqual({
      hashtags: [],
      user_mentions: [],
      urls: [{ indices: [0, 3], display_url: "url" }],
      symbols: []
    });
    expect(normalized.quoted_tweet?.entities).toEqual({
      hashtags: [],
      user_mentions: [],
      urls: [],
      symbols: []
    });
  });
});
