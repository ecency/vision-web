"use client";

import dynamic from "next/dynamic";
import { NavbarSearchShell } from "./navbar-search-shell";

/*
  The desktop search (input + suggester + transfer/bookmarks/drafts/gallery
  modules) is heavy. The desktop navbar is `hidden md:flex` but still mounts on
  mobile, so a static import would ship all of that into the mobile critical
  path purely as waste. Load it as a separate chunk; the caller gates mounting
  on a confirmed desktop viewport so the chunk never loads on phones.

  The loading fallback is the same pixel-identical shell the caller renders
  before the gate opens: without it the slot would flash empty between the
  moment isDesktop flips true and the moment the chunk arrives (#1665 review).
*/
export const Search = dynamic(
  () => import("@/features/shared/navbar/search").then((m) => ({ default: m.Search })),
  { ssr: false, loading: () => <NavbarSearchShell /> }
);
