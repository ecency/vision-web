"use client";

import React, { useCallback, useState } from "react";
import { Entry } from "@/entities";
import ProfilePopoverCard from "@/features/shared/profile-popover/profile-popover-card";
import { ProfilePopoverAuthor } from "@/features/shared/profile-popover/profile-popover-author";

// The author label must stay in the server HTML (SEO + zero layout shift), but
// the hover card around it (floating-ui, a resize listener, a click-away
// listener, two portals and the ProfilePreview fetch) is only ever needed once
// the author is actually hovered/focused. On a feed/profile that wrapper was
// mounting eagerly on every one of ~25 cards at hydration. Defer it: render
// just the label until the first interaction, then mount the real Popover (and
// open it immediately via the shared `show` state so the first hover isn't
// swallowed). Below-the-fold cards that are never hovered pay nothing.
export const ProfilePopover = ({ entry }: { entry: Entry }) => {
  const author = entry.original_entry ? entry.original_entry.author : entry.author;
  const [armed, setArmed] = useState(false);

  const arm = useCallback(() => setArmed(true), []);

  if (!armed) {
    // Desktop arms on hover/focus; touch arms on a deliberate tap (onClick, not
    // onTouchStart — the latter would fire mid-scroll when a finger merely
    // starts on the label and pop the mobile sheet by accident). The mounted
    // card opens itself via `defaultShow`, so the arming interaction also opens
    // the popover.
    return (
      <div role="presentation" onMouseEnter={arm} onFocus={arm} onClick={arm}>
        <ProfilePopoverAuthor author={author} />
      </div>
    );
  }

  return <ProfilePopoverCard author={author} />;
};
