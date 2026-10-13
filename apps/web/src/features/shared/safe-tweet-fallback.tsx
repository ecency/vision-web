"use client";

import i18next from "i18next";

export function TweetFallback({ id }: { id: string }) {
  return (
    <div className="er-twitter-fallback my-2 rounded-lg border border-[--border-color] p-4 text-center text-sm text-gray-600 dark:text-gray-400">
      {i18next.t("tweet.load-failed")}{" "}
      <a
        className="text-blue-500 hover:underline"
        href={`https://x.com/i/status/${id}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        {i18next.t("tweet.view-on-x")}
      </a>
    </div>
  );
}
