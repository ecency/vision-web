"use client";

// Catches a failed community lookup on client-side navigation (#2000). See
// LookupUnavailableError for why a full page load never reaches it.
export { LookupUnavailableError as default } from "@/features/shared/lookup-unavailable";
