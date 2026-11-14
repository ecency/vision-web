"use client";

import { Feedback } from "@/features/shared/feedback";
import { LoginRequired } from "@/features/shared/login-required";
import { Navbar } from "@/features/shared/navbar";
import { ScrollToTop } from "@/features/shared/scroll-to-top";
import { Theme } from "@/features/shared/theme";
import {
  SetupExternalHeader,
  SetupExternalImport,
  SetupExternalMetamask
} from "./_components";
import { Button } from "@/features/ui";
import { UilArrowRight } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { useMemo, useState } from "react";

export default function WalletSetupExternalPage() {
  const [step, setStep] = useState<"intro" | "metamask" | "import">("intro");

  const options = useMemo(
    () =>
      step === "intro"
        ? [
            {
              title: i18next.t("wallet.link-metamask.title", { defaultValue: "Link MetaMask" }),
              description: i18next.t("wallet.link-metamask.intro-description", {
                defaultValue:
                  "Connect your MetaMask wallet to link BTC, ETH, BNB and SOL addresses and enable MetaMask login for your Hive account."
              }),
              buttonText: i18next.t("g.continue"),
              onClick: () => setStep("metamask")
            },
            {
              title: i18next.t("wallet.watch-wallet.title", { defaultValue: "Watch Wallet" }),
              description: i18next.t("wallet.watch-wallet.intro-description", {
                defaultValue:
                  "Enter wallet addresses to monitor balances. View-only — no transactions."
              }),
              buttonText: i18next.t("g.continue"),
              onClick: () => setStep("import")
            }
          ]
        : [],
    [step]
  );

  return (
    <>
      <ScrollToTop />
      <Theme />
      <Feedback />
      <Navbar />
      <div className="fixed top-0 left-0 w-full h-full bg-gradient-to-br from-blue-dark-sky to-blue-duck-egg backdrop-blur-lg -z-[1]" />
      <div className="fixed top-0 left-0 w-full h-full bg-white/80 dark:bg-black/90 backdrop-blur-lg -z-[1]" />
      <div className="container mx-auto px-2 pt-[63px] md:pt-[69px] min-h-[100vh] pb-24 md:pb-16">
        <SetupExternalHeader />
        <div className="grid grid-cols-2 gap-4">
          {options.map(({ title, description, buttonText, onClick }) => (
            <LoginRequired key={title}>
              <div
                className="bg-white rounded-2xl p-6 flex flex-col justify-between gap-4 cursor-pointer border border-transparent hover:border-blue-dark-sky"
                onClick={onClick}
              >
                <div className="text-xl font-bold">{title}</div>
                <div className="text-gray-600 dark:text-gray-400">{description}</div>

                <Button size="lg" icon={<UilArrowRight />}>
                  {buttonText}
                </Button>
              </div>
            </LoginRequired>
          ))}
          {step === "metamask" && <SetupExternalMetamask onBack={() => setStep("intro")} />}
          {step === "import" && <SetupExternalImport onBack={() => setStep("intro")} />}
        </div>
      </div>
    </>
  );
}
