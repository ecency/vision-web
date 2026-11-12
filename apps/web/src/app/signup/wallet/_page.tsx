"use client";

import { EcencyWalletCurrency } from "@ecency/sdk/wallets";
import { useState } from "react";
import {
  SignupWalletStepper,
  MetamaskSignupStep
} from "./_components/signup-wallet-stepper";
import { SignupWalletIntro } from "./_components/steps/signup-wallet-intro";
import { MetamaskConnect } from "./_components/steps/metamask-connect";
import { MetamaskAccountCreating } from "./_components/steps/metamask-account-creating";

interface VerifiedWallet {
  currency: EcencyWalletCurrency;
  address: string;
  addresses: Partial<Record<EcencyWalletCurrency, string>>;
}

export default function SignupByWalletPage() {
  const [step, setStep] = useState(MetamaskSignupStep.INTRO);
  const [username, setUsername] = useState("");
  const [verifiedWallet, setVerifiedWallet] = useState<VerifiedWallet>();

  return (
    <div className="container mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 lg:gap-10 xl:gap-12 items-start">
      <SignupWalletStepper step={step} />

      <div className="md:col-span-2 flex flex-col max-w-[800px] w-full justify-center reading-surface px-4 py-8 sm:px-6 sm:py-10 md:px-8 rounded-xl">
        {step === MetamaskSignupStep.INTRO && (
          <SignupWalletIntro
            initialUsername={username}
            username={username}
            setUsername={setUsername}
            onNext={() => setStep(MetamaskSignupStep.CONNECT)}
          />
        )}
        {step === MetamaskSignupStep.CONNECT && (
          <MetamaskConnect
            username={username}
            onVerified={(currency, address, addresses) => {
              setVerifiedWallet({ currency, address, addresses });
              setStep(MetamaskSignupStep.CREATE_ACCOUNT);
            }}
            onBack={() => setStep(MetamaskSignupStep.INTRO)}
          />
        )}
        {step === MetamaskSignupStep.CREATE_ACCOUNT && verifiedWallet && (
          <MetamaskAccountCreating
            username={username}
            verifiedWallet={verifiedWallet}
          />
        )}
      </div>
    </div>
  );
}
