import React from "react";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import i18next from "i18next";
import { externalLink } from "@ui/svg";
import { openInNewTab } from "@/utils/open-in-new-tab";

export const InsufficientResourceCreditsDetails = () => {
  const { activeUser } = useActiveAccount();

  return (
    <div className="insufficient-resource-credits-details">
      <p className="mb-4">{i18next.t("feedback-modal.insufficient-resource-title")}</p>
      <div className="rounded-xl border border-[--border-color] market-swap-active-orders">
        <div
          className="border-b border-[--border-color] px-4 py-3 cursor-pointer"
          role="link"
          tabIndex={0}
          onClick={() => openInNewTab(`/purchase?username=${activeUser?.username}&type=boost`)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openInNewTab(`/purchase?username=${activeUser?.username}&type=boost`);
            }
          }}
        >
          {i18next.t("feedback-modal.insufficient-resource-purchase")} {externalLink}
        </div>
        <div
          className="border-b border-[--border-color] px-4 py-3 cursor-pointer"
          role="link"
          tabIndex={0}
          onClick={() => openInNewTab("/faq#what-powering-up")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openInNewTab("/faq#what-powering-up");
            }
          }}
        >
          {i18next.t("feedback-modal.insufficient-resource-buy-hive")} {externalLink}
        </div>
        <div
          className="border-b border-[--border-color] px-4 py-3 cursor-pointer"
          role="link"
          tabIndex={0}
          onClick={() => openInNewTab("/faq#what-are-rc")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openInNewTab("/faq#what-are-rc");
            }
          }}
        >
          {i18next.t("feedback-modal.insufficient-resource-wait")} {externalLink}
        </div>
      </div>
    </div>
  );
};
