import { useEffect, useRef, useState } from "react";
import { usePublishState } from "../hooks/use-publish-state";
import { usePublishPost } from "../hooks/use-publish-post";
import { Link } from "@tanstack/react-router";
import { UilArrowLeft } from "@tooni/iconscout-unicons-react";
import { t } from "@/core";
import { useHiveLayer } from "@/features/blog/hooks/use-hive-layer";
import { PublishDisclosure } from "@/features/shared/hive-disclosure";
import { nextPublishPress } from "../utils/publish-press";
import { PublishRewardSelector } from "./publish-reward-selector";

interface Props {
  onSuccess?: () => void;
}

export function PublishActionBar({ onSuccess }: Props) {
  const { title, content, tags, rewardType, setRewardTypeState, clearAll } =
    usePublishState();
  // Clamped by the resolver to `off` when "Create post" points at another
  // site: an owner who sends authors elsewhere must not get a panel that
  // configures a composer nobody uses.
  const { authorRewards } = useHiveLayer();
  const {
    mutateAsync: publishPost,
    isPending: isPublishing,
    error,
  } = usePublishPost({ beforeNavigate: clearAll });

  /** A press has asked to publish and is waiting for a second one. */
  const [armed, setArmed] = useState(false);
  /**
   * A broadcast has been started and has not settled.
   *
   * A ref rather than state, and set before the await rather than after a
   * render: `isPublishing` only becomes true on the next render, so two presses
   * in the same frame can both see it false. Broadcasts retry on their own, and
   * a duplicated publish is a second post on chain that nobody can delete, so
   * the thing that refuses the second press has to be synchronous.
   */
  const inFlight = useRef(false);

  const safeTitle = title ?? "";
  const safeContent = content ?? "";
  const safeTags = tags ?? [];

  const canPublish =
    safeTitle.trim().length > 0 &&
    safeContent.trim().length > 0 &&
    safeTags.length > 0;

  // Changing what would be broadcast withdraws the confirmation. Otherwise an
  // author could arm the button on one reward split and publish another.
  useEffect(() => {
    setArmed(false);
  }, [rewardType]);

  const handlePublish = async () => {
    const press = nextPublishPress({
      canPublish,
      isPublishing,
      inFlight: inFlight.current,
      armed,
    });

    if (press === "ignore") return;

    if (press === "arm") {
      setArmed(true);
      return;
    }

    inFlight.current = true;
    setArmed(false);

    try {
      await publishPost({
        title: safeTitle,
        body: safeContent,
        tags: safeTags,
        rewardType,
      });
      onSuccess?.();
    } catch (err) {
      // Error is handled by usePublishPost hook
      console.error("Failed to publish:", err);
    } finally {
      // A failed publish leaves the button unarmed, so recovering from an
      // error costs the same two presses as the first attempt did.
      inFlight.current = false;
    }
  };

  return (
    <div className="max-w-[1024px] mx-auto flex justify-between items-center">
      <Link
        search={{ filter: "posts" }}
        className="text-sm flex items-center gap-2 whitespace-nowrap"
        to="/blog"
      >
        <UilArrowLeft className="size-6" />
        Back to blog
      </Link>
      <div className="px-2 md:px-4 py-4 flex justify-end">
        <div className="flex flex-col items-end gap-2">
          {authorRewards === "author" && (
            <PublishRewardSelector
              value={rewardType}
              onChange={setRewardTypeState}
              disabled={isPublishing}
            />
          )}
          {/*
            Not configurable, by design. Publishing is the one action here that
            cannot be undone, so the statement of that goes above the button
            regardless of how the instance is configured.
          */}
          <div className="max-w-sm text-right">
            <PublishDisclosure />
          </div>
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-2 rounded">
              {error.message}
            </div>
          )}
          <button
            type="button"
            onClick={handlePublish}
            disabled={!canPublish || isPublishing}
            className={`px-6 py-2 rounded-lg font-medium text-sm transition-colors ${
              canPublish && !isPublishing
                ? "bg-black hover:bg-black/80 text-white cursor-pointer"
                : "bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed"
            }`}
          >
            {isPublishing ? (
              <span className="flex items-center gap-2">
                <span className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Publishing...
              </span>
            ) : (
              // Same button, second press. No dialog: a dialog is one more
              // thing to dismiss and it moves the decision away from the split
              // printed directly above.
              <span aria-live="polite">
                {armed ? t("publish_confirm") : "Publish"}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
