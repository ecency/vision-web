"use client";

import { useGlobalStore } from "@/core/global-store";
import { Entry } from "@/entities";
import { EntryPageNsfwWarning } from "@/app/(dynamicPages)/entry/[category]/[author]/[permlink]/_components/entry-page-nsfw-warning";
import { needsNsfwGate } from "./entry-page-nsfw-gate";
import React from "react";

interface Props {
  entry: Entry;
  showIfNsfw: boolean;
  children: React.ReactNode;
}

export function EntryPageNsfwRevealing({ entry, showIfNsfw, children }: Props) {
  const globalNsfw = useGlobalStore((s) => s.nsfw);

  const showNsfwWarning = needsNsfwGate(entry) && !showIfNsfw && !globalNsfw;

  return showNsfwWarning ? <EntryPageNsfwWarning /> : children;
}
