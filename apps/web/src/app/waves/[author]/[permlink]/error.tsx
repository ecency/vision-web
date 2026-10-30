"use client";

// Catches a failed wave lookup on client-side navigation (#2000). See
// LookupUnavailableError for when it renders.
export { LookupUnavailableError as default } from "@/features/shared/lookup-unavailable";
