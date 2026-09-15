"use client";

import clsx from "clsx";
import { Button } from "@ui/button";

/** An on/off filter chip, shared by the toolbar and the refine panel. */
export function ToggleChip({
  on,
  label,
  onClick,
  tone
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  tone?: "red";
}) {
  return (
    <Button
      size="xs"
      appearance={on ? "pressed" : "gray-link"}
      outline={!on}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={clsx(
        "!rounded-full !min-h-[36px]",
        on && "!bg-blue-dark-sky/10 !text-blue-dark-sky",
        tone === "red" && on && "!bg-red/10 !text-red-030 dark:!bg-red/20 dark:!text-red-light-020"
      )}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
