export * from "./user-avatar";
export * from "./search-box";
export * from "./scroll-to-top";
export * from "./linear-progress";
export * from "./profile-link";
export * from "./login-required";
export * from "./theme";
export * from "./navbar";
export * from "./login";
export * from "./or-divider";
export * from "./feedback";
export * from "./notification-handler";
export * from "./switch-lang";
export * from "./search-suggester";
export * from "./suggestion-list";
export * from "./entry-link";
export * from "./follow-controls";
export * from "./image-upload-button";
export * from "./list-style-toggle";
export * from "./detect-bottom";
export * from "./ecency-source-badge";
export * from "./ai-usage-badge";
export * from "./search-list-item";
export * from "./formatted-currency";
export * from "./entry-list-loading-item";
export * from "./entry-list-content";
export * from "./entry-list-item";
export * from "./entry-menu";
export * from "./skeleton";
export * from "./profile-popover";
export * from "./entry-vote-btn";
export * from "./entry-tip-btn";
export * from "./entry-payout";
export * from "./entry-votes";
export * from "./entry-reblog-btn";
export * from "./message-no-data";
export * from "./entry-info";
export * from "./bookmark-btn";
// NOTE: the interaction-only dialog families (./transfer, ./promote, ./boost,
// ./purchase-qr, ./buy-sell-hive, ./key-or-hot, ./transactions) are intentionally
// NOT re-exported from this barrel. Re-exporting them dragged their chunks into
// EVERY route's pre-paint graph through the navbar's client boundary (#1668).
// Deep-import them: "@/features/shared/<family>".
// NOTE: ./discussion is intentionally NOT re-exported from this barrel. The
// Discussion tree (DiscussionList -> DiscussionItem) imports the reply/edit
// composer, so re-exporting it here dragged that whole path into any page that
// imports an unrelated symbol from this barrel. Import it directly:
// `import { Discussion } from "@/features/shared/discussion"`.
export * from "./entry-delete-btn";
// NOTE: ./comment (the reply/edit composer) is intentionally NOT re-exported from
// this barrel. It pulls the markdown editor toolbar, emoji/GIF pickers, textarea
// autocomplete, polls and video upload (~80KB) — importing any unrelated symbol
// from this barrel dragged all of that into pages that never render a composer.
// Import it directly: `import { Comment } from "@/features/shared/comment"`.
export * from "./click-away-listener";
export * from "./available-credits";
export * from "./login";
export * from "./wallet-badge";
export * from "./metamask-sign-button";
export * from "./image-upload-button";
export * from "./notifications";
export * from "./gallery";
export * from "./static-navbar";
export * from "./edit-history";
// NOTE: ./editor-toolbar is intentionally NOT re-exported here — see the ./comment
// note above. Import directly from "@/features/shared/editor-toolbar".
export * from "./redirect";
export * from "./entry-stats";
export * from "./post-content-renderer";
export * from "./time-label";
export * from "./tag";
export * from "./hiveposh";
export * from "./stepper";
export * from "./auth-upgrade";
