"use client";

import { BoostDialog } from "@/features/shared/boost";
import { LoginRequired } from "@/features/shared/login-required";
import { PurchaseQrDialog } from "@/features/shared/purchase-qr";
import { EcencyConfigManager } from "@/config";
import { hostingApi } from "@/features/hosting-signup/hosting-api";
import { isStripeEnabled } from "@/features/shared/purchase-stripe/stripe-tiers";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { isProMember } from "@/features/pro";
import { getProMembersQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import i18next from "i18next";
import {
  UilBug,
  UilGift,
  UilGlobe,
  UilHeart,
  UilImages,
  UilStar
} from "@tooni/iconscout-unicons-react";
import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import * as ls from "@/utils/local-storage";
import { PERKS_SEEN_KEY } from "@/features/shared/navbar/navbar-perks-button";
import {
  PerksBasicCard,
  PerksPointsCard,
  PerksPointsSpinBanner,
  PerksPromoteCard,
  PerksQuestsSection
} from "./components";

// Lazy-load the Pro dialog so /perks doesn't pull @stripe/stripe-js (which injects the
// js.stripe.com script on import) into its bundle until the user opens the checkout.
const ProDialog = dynamic(() => import("@/features/pro/pro-dialog").then((m) => m.ProDialog), {
  ssr: false
});

// Existing Pro members open the free-blog claim (not the checkout) from the Pro card.
const ProBlogDialog = dynamic(
  () => import("@/features/pro/pro-blog-dialog").then((m) => m.ProBlogDialog),
  { ssr: false }
);

export function PerksPage() {
  const { username } = useActiveAccount();
  const { data: proMembers } = useQuery(getProMembersQueryOptions());
  const isPro = isProMember(proMembers?.members, username);

  const [showBoost, setShowBoost] = useState(false);
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [showPro, setShowPro] = useState(false);
  const [showProBlog, setShowProBlog] = useState(false);
  const [resumePro, setResumePro] = useState<string | undefined>(undefined);

  // Opening the hub clears the one-time discovery dot on the navbar perks button.
  useEffect(() => {
    ls.set(PERKS_SEEN_KEY, true);
  }, []);

  // A redirect-based Pro payment returns to /perks?pro=1 with Stripe's payment_intent +
  // redirect_status appended. Only resume the grant poll when the payment actually completed --
  // a canceled/failed redirect returns the same params, and polling it would show a false
  // "activating" then pending. Strip the params either way so a refresh won't re-fire.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const pi = p.get("payment_intent");
    if (p.get("pro") !== "1" || !pi) return;
    const status = p.get("redirect_status");
    if (status === "succeeded" || status === "processing") {
      setResumePro(pi);
      setShowPro(true);
    }
    const url = new URL(window.location.href);
    ["pro", "payment_intent", "payment_intent_client_secret", "redirect_status"].forEach((k) =>
      url.searchParams.delete(k)
    );
    window.history.replaceState({}, "", url.toString());
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <LoginRequired>
        <PerksQuestsSection />
      </LoginRequired>

      <div className="grid grid-cols-12 grid-rows-4 gap-4">
        <div className="col-span-12 sm:col-span-6 row-span-4 md:col-span-5">
          <PerksPointsCard />
        </div>
        <div className="col-span-12 sm:col-span-6 row-span-4 md:col-span-4">
          <PerksPromoteCard />
        </div>
        <div className="col-span-6 row-span-2 md:col-span-3">
          <LoginRequired>
            <PerksBasicCard
              className="md:text-lg font-bold min-h-[13rem] cursor-pointer"
              onClick={() => setShowQrDialog(true)}
            >
              <div className="p-4 text-blue-dark-sky relative z-10">
                {i18next.t("perks.account-boost-title")}
              </div>
              <Image
                className="absolute -bottom-8"
                src="/assets/undraw-power.svg"
                width={320}
                height={240}
                alt=""
              />
            </PerksBasicCard>
          </LoginRequired>
        </div>
        <div className="col-span-6 row-span-2 md:col-span-3">
          <LoginRequired>
            <PerksBasicCard
              className="min-h-[13rem] cursor-pointer p-4"
              onClick={() => setShowBoost(true)}
            >
              <div className="md:text-lg font-bold">{i18next.t("perks.boost-plus-title")}</div>
              <div className="text-sm md:text-base text-gray-600 dark:text-gray-400">
                {i18next.t("perks.boost-plus-description")}
              </div>
            </PerksBasicCard>
          </LoginRequired>
        </div>

        <div className="col-span-6 row-span-2 md:col-span-3">
          <LoginRequired>
            <PerksBasicCard
              className="min-h-[13rem] p-4 cursor-pointer"
              onClick={() => (isPro ? setShowProBlog(true) : setShowPro(true))}
            >
              <div className="relative z-10">
                <div className="md:text-lg font-bold text-blue-dark-sky">
                  {i18next.t("pro.perk-card-title")}
                </div>
                <div className="text-sm md:text-base text-gray-600 dark:text-gray-400">
                  {isPro
                    ? i18next.t("pro.perk-card-member")
                    : i18next.t("pro.perk-card-description")}
                </div>
              </div>
              <UilStar className="absolute -bottom-5 -right-3 size-28 text-blue-dark-sky opacity-10 pointer-events-none" />
            </PerksBasicCard>
          </LoginRequired>
        </div>

        <EcencyConfigManager.Conditional
          condition={({ visionFeatures }) => visionFeatures.aiImageGenerator.enabled}
        >
          <div className="col-span-6 row-span-2 md:col-span-3">
            <LoginRequired>
              <Link href="/perks/ai-generator">
                <PerksBasicCard className="min-h-[13rem] cursor-pointer p-4">
                  <div className="relative z-10">
                    <div className="md:text-lg font-bold text-blue-dark-sky">
                      {i18next.t("ai-image-generator.perk-card-title")}
                    </div>
                    <div className="text-sm md:text-base text-gray-600 dark:text-gray-400">
                      {i18next.t("ai-image-generator.perk-card-description")}
                    </div>
                  </div>
                  <UilImages className="absolute -bottom-5 -right-3 size-28 text-blue-dark-sky opacity-10 pointer-events-none" />
                </PerksBasicCard>
              </Link>
            </LoginRequired>
          </div>
        </EcencyConfigManager.Conditional>

        {hostingApi.isConfigured() && (
          <div className="col-span-6 row-span-2 md:col-span-3">
            <Link href="/hosting">
              <PerksBasicCard className="min-h-[13rem] cursor-pointer p-4">
                <div className="relative z-10">
                  <div className="md:text-lg font-bold text-blue-dark-sky">
                    {i18next.t("hosting.perk-card-title")}
                  </div>
                  <div className="text-sm md:text-base text-gray-600 dark:text-gray-400">
                    {i18next.t("hosting.perk-card-description")}
                  </div>
                </div>
                <UilGlobe className="absolute -bottom-5 -right-3 size-28 text-blue-dark-sky opacity-10 pointer-events-none" />
              </PerksBasicCard>
            </Link>
          </div>
        )}

        {EcencyConfigManager.CONFIG.visionFeatures.raidstead.enabled && (
          <div className="col-span-6 row-span-2 md:col-span-3">
            <Link href="/raidstead">
              <PerksBasicCard className="min-h-[13rem] cursor-pointer p-4">
                <div className="relative z-10">
                  <div className="md:text-lg font-bold text-blue-dark-sky">
                    {i18next.t("raidstead.perk-card-title")}
                  </div>
                  <div className="text-sm md:text-base text-gray-600 dark:text-gray-400">
                    {i18next.t("raidstead.perk-card-description")}
                  </div>
                </div>
                <UilBug className="absolute -bottom-5 -right-3 size-28 text-blue-dark-sky opacity-10 pointer-events-none" />
              </PerksBasicCard>
            </Link>
          </div>
        )}

        {isStripeEnabled() && (
          <div className="col-span-6 row-span-2 md:col-span-3">
            <Link href="/gift">
              <PerksBasicCard className="min-h-[13rem] cursor-pointer p-4">
                <div className="relative z-10">
                  <div className="md:text-lg font-bold text-blue-dark-sky">
                    {i18next.t("points-gift.perk-card-title")}
                  </div>
                  <div className="text-sm md:text-base text-gray-600 dark:text-gray-400">
                    {i18next.t("points-gift.perk-card-description")}
                  </div>
                </div>
                <UilGift className="absolute -bottom-5 -right-3 size-28 text-blue-dark-sky opacity-10 pointer-events-none" />
              </PerksBasicCard>
            </Link>
          </div>
        )}

        <div className="col-span-6 row-span-2 md:col-span-3">
          <LoginRequired>
            <Link href={`/@${username}/settings#support-ecency`}>
              <PerksBasicCard className="min-h-[13rem] cursor-pointer p-4">
                <div className="relative z-10">
                  <div className="md:text-lg font-bold text-blue-dark-sky">
                    {i18next.t("support-ecency.perk-card-title")}
                  </div>
                  <div className="text-sm md:text-base text-gray-600 dark:text-gray-400">
                    {i18next.t("support-ecency.perk-card-description")}
                  </div>
                </div>
                <UilHeart className="absolute -bottom-5 -right-3 size-28 text-blue-dark-sky opacity-10 pointer-events-none" />
              </PerksBasicCard>
            </Link>
          </LoginRequired>
        </div>

        <div id="perks-spin" className="col-span-12 md:col-span-6 row-span-2">
          <LoginRequired>
            <PerksPointsSpinBanner />
          </LoginRequired>
        </div>
        {showBoost && <BoostDialog onHide={() => setShowBoost(false)} />}
        {showPro && username && (
          <ProDialog
            username={username}
            resumePaymentIntent={resumePro}
            onHide={() => {
              setShowPro(false);
              setResumePro(undefined);
            }}
          />
        )}
        {showProBlog && username && (
          <ProBlogDialog username={username} onHide={() => setShowProBlog(false)} />
        )}
        <PurchaseQrDialog show={showQrDialog} setShow={(v) => setShowQrDialog(v)} />
      </div>
    </div>
  );
}
