/**
 * Image server choices for the preferences select, keyed by the server URL so a label can
 * never drift onto another host's value. Every entry must be in ALLOWED_IMAGE_SERVERS
 * (defaults.ts), otherwise the stored override is ignored.
 */
export const IMAGE_SERVER_OPTIONS: ReadonlyArray<{ value: string; labelKey: string }> = [
  { value: "https://i.ecency.com", labelKey: "preferences.image-server-default" },
  { value: "https://images.ecency.com", labelKey: "preferences.image-server-ecency-alt" },
  { value: "https://images.hive.blog", labelKey: "preferences.image-server-hiveblog" },
  { value: "https://img.ecency.com", labelKey: "preferences.image-server-nocdn" }
];
