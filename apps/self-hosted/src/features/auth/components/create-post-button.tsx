"use client";

import { InstanceConfigManager, t } from "@/core";
import { useInstanceConfig } from "@/features/blog/hooks/use-instance-config";
import { UilPen } from "@tooni/iconscout-unicons-react";
import { Link } from "@tanstack/react-router";
import { useIsAuthEnabled, useIsAuthenticated, useIsBlogOwner } from "../hooks";
import { resolveCreatePostTarget } from "../utils/create-post-target";

// `no-underline` and `font-serif` carried a `!` because the unlayered `a` and
// `*` rules in globals.css beat every utility. Those rules are in @layer base
// now, so an ordinary utility wins and the `!important` is not needed.
const BUTTON_CLASS =
  "fixed bottom-6 right-30 z-50 px-4 py-2 flex items-center text-sm no-underline rounded-full border border-gray-400 dark:border-gray-600 font-serif";

export function CreatePostButton() {
  const isBlogOwner = useIsBlogOwner();
  const isAuthEnabled = useIsAuthEnabled();
  const isAuthenticated = useIsAuthenticated();
  const { isCommunityMode } = useInstanceConfig();

  // Blog instances use the built-in editor by default too, so the owner writes
  // on their own domain instead of being handed off elsewhere. An owner who has
  // deliberately set general.createPostUrl still goes there. resolveCreatePostTarget
  // owns the whole decision, including why community mode ignores the config.
  const target = resolveCreatePostTarget({
    createPostUrl: InstanceConfigManager.getConfigValue(
      ({ configuration }) => configuration.general.createPostUrl,
    ),
    isCommunityMode,
  });

  // Community instances: any authenticated user can post into the community
  // (standard Hive community moderation still applies). Blog instances: only
  // the instance owner can post. The /publish route enforces the same rule, so
  // hiding the button is presentation and not the gate.
  const canCreatePost = isCommunityMode ? isAuthenticated : isBlogOwner;

  if (!isAuthEnabled || !canCreatePost) {
    return null;
  }

  const label = (
    <>
      <UilPen className="size-4" />
      <span className="hidden sm:block">{t("create_post")}</span>
    </>
  );

  if (target.kind === "internal") {
    return (
      <Link to="/publish" className={BUTTON_CLASS}>
        {label}
      </Link>
    );
  }

  return (
    <a
      href={target.href}
      target="_blank"
      rel="noopener noreferrer"
      className={BUTTON_CLASS}
    >
      {label}
    </a>
  );
}
