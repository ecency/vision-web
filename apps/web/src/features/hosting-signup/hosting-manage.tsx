"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import { useEffect, useState } from "react";
import { CustomDomainManager } from "./custom-domain-manager";
import { CustomDomainUpgrade } from "./custom-domain-upgrade";
import { hostingApi, type OwnedTenant } from "./hosting-api";

/**
 * Compact "your hosted sites" panel for the /hosting page. Signup used to be the only surface,
 * so after leaving the success screen owners had no way back to their site's status or custom
 * domain setup. Lists every tenant the logged-in account controls (personal blog and
 * communities) with status, expiry and, on the Custom domain plan, the domain manager.
 */
export function HostingManage() {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username ?? "";
  const [domainOpenFor, setDomainOpenFor] = useState<string | null>(null);
  const [upgradeOpenFor, setUpgradeOpenFor] = useState<string | null>(null);

  // Keyed by owner so switching accounts can never render the previous account's tenants.
  const { data, refetch } = useQuery({
    queryKey: ["hosting", "owned-tenants", username],
    queryFn: () => hostingApi.tenantsByOwner(username),
    enabled: username.length > 0
  });
  const tenants = data?.tenants ?? [];

  // The reservation window, for the awaiting-payment note below. Fetched only when an
  // unpaid reservation is actually listed.
  const hasInactive = tenants.some((t) => t.subscriptionStatus === "inactive");
  const { data: methods } = useQuery({
    queryKey: ["hosting", "payment-methods"],
    queryFn: () => hostingApi.paymentMethods(),
    enabled: hasInactive
  });
  const graceDays = methods?.reservation?.graceDays;

  useEffect(() => {
    setDomainOpenFor(null);
    setUpgradeOpenFor(null);
  }, [username]);

  if (!activeUser || tenants.length === 0) {
    return null;
  }

  const statusLabel = (t: OwnedTenant) => {
    if (t.subscriptionStatus === "active") {
      const date = t.subscriptionExpiresAt
        ? new Date(t.subscriptionExpiresAt).toLocaleDateString()
        : "";
      return i18next.t("hosting.manage-status-active", { date });
    }
    if (t.subscriptionStatus === "inactive") return i18next.t("hosting.manage-status-inactive");
    if (t.subscriptionStatus === "suspended") return i18next.t("hosting.manage-status-suspended");
    return i18next.t("hosting.manage-status-expired");
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[--border-color] p-4">
      <div className="font-semibold">{i18next.t("hosting.manage-title")}</div>
      {tenants.map((t) => (
        <div
          key={t.username}
          className="flex flex-col gap-2 border-b border-[--border-color] last:border-b-0 pb-3 last:pb-0"
        >
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {t.blogUrl ? (
                <a
                  href={t.blogUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-dark-sky hover:underline font-medium"
                >
                  {t.username}
                </a>
              ) : (
                <span className="font-medium">{t.username}</span>
              )}
              <span className="text-xs px-2 py-0.5 rounded-full border border-[--border-color] opacity-75">
                {i18next.t(t.type === "community" ? "hosting.type-community" : "hosting.type-blog")}
              </span>
              {t.subscriptionPlan === "pro" && (
                <span className="text-xs px-2 py-0.5 rounded-full border border-blue-dark-sky text-blue-dark-sky">
                  {i18next.t("hosting.manage-plan-pro")}
                </span>
              )}
            </div>
            <span className="text-sm opacity-75">{statusLabel(t)}</span>
          </div>

          {t.subscriptionPlan === "pro" && t.subscriptionStatus === "active" && (
            <div className="text-sm">
              {t.customDomain && t.customDomainVerified ? (
                <span className="opacity-75">
                  {i18next.t("hosting.manage-domain-active", { domain: t.customDomain })}
                </span>
              ) : domainOpenFor === t.username ? (
                <CustomDomainManager
                  username={username}
                  tenant={t.username !== username ? t.username : undefined}
                />
              ) : (
                <button
                  className="text-blue-dark-sky hover:underline"
                  onClick={() => setDomainOpenFor(t.username)}
                >
                  {i18next.t("hosting.manage-domain")}
                </button>
              )}
            </div>
          )}

          {/* Awaiting payment (never activated): let the owner jump straight back into the payment
              step for this reservation instead of dead-ending on the status label. */}
          {t.subscriptionStatus === "inactive" && (
            <div className="text-sm flex flex-col gap-1">
              <a
                href={`/hosting?resume=${encodeURIComponent(t.username)}`}
                className="text-blue-dark-sky hover:underline"
              >
                {i18next.t("hosting.manage-continue-payment")}
              </a>
              {!!graceDays && (
                <span className="opacity-60">
                  {i18next.t("hosting.reservation-grace-manage", { count: graceDays })}
                </span>
              )}
            </div>
          )}

          {/* Standard active tenant: add a custom domain by upgrading to Pro, prorated (+1/mo for
              the months left on the current term). Expands the upgrade flow inline; on success the
              tenant is Pro and a refetch swaps in the domain manager above. */}
          {t.subscriptionPlan === "standard" && t.subscriptionStatus === "active" && (
            <div className="text-sm">
              {upgradeOpenFor === t.username ? (
                <CustomDomainUpgrade
                  tenant={t.username}
                  onUpgraded={() => {
                    setUpgradeOpenFor(null);
                    void refetch();
                  }}
                />
              ) : (
                <>
                  <button
                    className="text-blue-dark-sky hover:underline font-medium"
                    onClick={() => setUpgradeOpenFor(t.username)}
                  >
                    {i18next.t("hosting.manage-add-domain")}
                  </button>
                  <span className="opacity-75">
                    {" — "}
                    {i18next.t("hosting.manage-add-domain-hint")}
                  </span>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default HostingManage;
