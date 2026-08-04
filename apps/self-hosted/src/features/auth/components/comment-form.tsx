"use client";

import clsx from "clsx";
import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useComment } from "@ecency/sdk";
import { useAuth, useIsAuthenticated, useIsAuthEnabled } from "../hooks";
import { t } from "@/core";
import { CommentDisclosure } from "@/features/shared/hive-disclosure";
import { createBroadcastAdapter } from "@/providers/sdk";

interface CommentFormProps {
  parentAuthor: string;
  parentPermlink: string;
  onSuccess?: () => void;
  className?: string;
}

export function CommentForm({
  parentAuthor,
  parentPermlink,
  onSuccess,
  className,
}: CommentFormProps) {
  const { user } = useAuth();
  const isAuthenticated = useIsAuthenticated();
  const isAuthEnabled = useIsAuthEnabled();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  const adapter = createBroadcastAdapter();
  const commentMutation = useComment(user?.username, { adapter });

  const handleSubmit = useCallback(async () => {
    if (!user || !body.trim() || commentMutation.isPending) return;

    setError(null);

    try {
      // Generate unique permlink for the comment with random suffix to avoid collisions
      const randomSuffix = Array.from(crypto.getRandomValues(new Uint8Array(4)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const permlink = `re-${parentAuthor.replace(
        /\./g,
        ""
      )}-${Date.now()}-${randomSuffix}`;

      await commentMutation.mutateAsync({
        author: user.username,
        permlink,
        parentAuthor,
        parentPermlink,
        title: "",
        body: body.trim(),
        jsonMetadata: {
          tags: [],
          app: "ecency-selfhost/1.0",
        },
      });

      // Clear form on success
      setBody("");
      onSuccess?.();
    } catch (err) {
      console.error("Comment failed:", err);
      setError(err instanceof Error ? err.message : "Failed to post comment");
    }
  }, [
    user,
    body,
    commentMutation,
    parentAuthor,
    parentPermlink,
    onSuccess,
  ]);

  // If auth is disabled, don't show the form
  if (!isAuthEnabled) {
    return null;
  }

  // If not authenticated, show login prompt
  if (!isAuthenticated) {
    return (
      <div
        className={clsx(
          "p-4 border border-theme rounded-lg bg-theme-secondary",
          className
        )}
      >
        <p className="text-theme-muted text-sm mb-3">{t("login_to_comment")}</p>
        <Link
          to="/login"
          search={{ redirect: `/@${parentAuthor}/${parentPermlink}` }}
          className="btn-theme-primary inline-block px-4 py-2 transition-colors text-sm"
        >
          {t("login")}
        </Link>
      </div>
    );
  }

  return (
    <div className={clsx("space-y-3", className)}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 size-8 rounded-full bg-theme-secondary flex items-center justify-center text-sm font-medium text-theme-primary">
          {user?.username?.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("write_comment")}
            className="w-full px-3 py-2 rounded-md border border-theme bg-theme text-theme-primary placeholder:text-theme-muted focus:outline-none focus:ring-2 focus:ring-theme-accent resize-none"
            rows={3}
            disabled={commentMutation.isPending}
          />
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-500 dark:text-red-400">{error}</div>
      )}

      {/*
        Not configurable, by design, and rendered only here: the unauthenticated
        branch above is a login prompt, not a form, so nothing can be written
        from it.
      */}
      <CommentDisclosure />

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={commentMutation.isPending || !body.trim()}
          className={clsx(
            "btn-theme-primary px-4 py-2 text-sm font-medium transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {commentMutation.isPending ? t("posting") : t("post_comment")}
        </button>
      </div>
    </div>
  );
}
