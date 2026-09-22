"use client";

import i18next from "i18next";
import { CurationApplicationsPanel } from "./curation-applications-panel";
import { useViewerRole } from "./hooks";

/**
 * The review queue's own page. It belongs to the bench rather than to the admins:
 * three endorsements grant a seat by themselves, so the mods need to reach this
 * without going through the admin-only roster tab it used to live in.
 */
export function CurationApplicationsView() {
  const { role, isLoading } = useViewerRole();
  const isReviewer = role === "admin" || role === "mod";

  if (isLoading) {
    return <p className="p-4 text-sm text-gray-500">{i18next.t("curation-desk.list.loading")}</p>;
  }
  if (!isReviewer) {
    return (
      <p className="p-6 text-center text-sm text-gray-500">
        {i18next.t("curation-desk.applications.reviewers-only")}
      </p>
    );
  }
  return (
    <div className="p-2">
      <CurationApplicationsPanel enabled={isReviewer} isAdmin={role === "admin"} />
    </div>
  );
}
