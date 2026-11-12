import { Badge, Button } from "@/features/ui";
import { EcencyWalletCurrency } from "@ecency/sdk/wallets";
import { SignupWalletChooseUsername } from "./signup-wallet-choose-username";
import i18next from "i18next";
import { UilArrowRight } from "@tooni/iconscout-unicons-react";
import { useMemo } from "react";

const CURRENCIES = [
  EcencyWalletCurrency.BTC,
  EcencyWalletCurrency.ETH,
  EcencyWalletCurrency.BNB,
  EcencyWalletCurrency.SOL
];

interface Props {
  initialUsername: string;
  username: string;
  setUsername: (value: string) => void;
  onNext: () => void;
}

export function SignupWalletIntro({ setUsername, initialUsername, onNext, username }: Props) {
  const isContinueDisabled = useMemo(() => !username, [username]);

  return (
    <>
      <div className="flex flex-col gap-6 lg:pb-4 xl:pb-6">
        <div>
          <div className="font-bold text-xl">{i18next.t("signup-wallets.intro.title")}</div>
          <div className="opacity-50 mb-4">{i18next.t("signup-wallets.intro.description")}</div>
        </div>

        <div>
          <div className="mb-2">{i18next.t("signup-wallets.intro.currencies-info")}</div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {CURRENCIES.map((currency) => (
              <Badge className="uppercase" key={currency}>
                {currency}
              </Badge>
            ))}
          </div>
          <SignupWalletChooseUsername
            initialUsername={initialUsername}
            onAvailableUsername={setUsername}
          />
        </div>
      </div>
      <div className="flex items-center mt-4 justify-end">
        <Button icon={<UilArrowRight />} size="sm" onClick={onNext} disabled={isContinueDisabled}>
          {i18next.t("g.continue")}
        </Button>
      </div>
    </>
  );
}
