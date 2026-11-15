import { useActiveAccount } from "@/core/hooks/use-active-account";
import { AssetOperation } from "@ecency/sdk";
import { UilArrowLeft, UilGift } from "@tooni/iconscout-unicons-react";
import clsx from "clsx";
import Link from "next/link";
import { HTMLProps, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { Button, Modal, ModalHeader } from "../ui";
import { DropdownContext } from "../ui/dropdown/dropdown-context";
import { isStripeEnabled } from "@/features/shared/purchase-stripe/stripe-tiers";
import {
  WalletOperationError,
  WalletOperationPowerDown,
  WalletOperationSign,
  WalletOperationsTransfer,
  WalletOperationSuccess,
  WalletOperationWithdrawRoutes,
  WalletOperationWithdrawRoutesForm
} from "./operations";
import i18next from "i18next";
import { getWalletOperationTitleKeys } from "./wallet-operation-title-keys";
import { MarketSwapForm } from "../market";

interface Props {
  operation: AssetOperation;
  asset: string;
  to: string | undefined;
  initialData?: Record<string, unknown>;
  /** Controlled mode: parent manages visibility. When provided, no trigger wrapper is rendered. */
  controlled?: {
    show: boolean;
    onHide: () => void;
  };
}

export function WalletOperationsDialog({
  children,
  operation,
  asset,
  to,
  initialData: initialDataProp,
  controlled,
  ...divProps
}: PropsWithChildren<Props> & HTMLProps<HTMLDivElement>) {
  const { activeUser } = useActiveAccount();
  const { setShow: setDropdownShow } = useContext(DropdownContext);
  const [internalShow, setInternalShow] = useState(false);
  const [step, setStep] = useState<"form" | "sign" | "success" | "error">("form");
  const initialData = useMemo(() => initialDataProp ?? {}, [initialDataProp]);
  const [data, setData] = useState<Record<string, unknown>>(initialData);
  const [signError, setSignError] = useState<Error>();

  const show = controlled ? controlled.show : internalShow;
  const setShow = controlled
    ? (v: boolean) => { if (!v) controlled.onHide(); }
    : setInternalShow;

  useEffect(() => {
    if (!show) {
      setData(initialData);
      setSignError(undefined);
    }
  }, [initialData, show]);

  useEffect(() => {
    if (controlled?.show) {
      setStep("form");
      setData(initialData);
      setSignError(undefined);
    }
  }, [controlled?.show]);

  const [titleNamespace, titleKey, subTitleKey] = useMemo(
    () => getWalletOperationTitleKeys(operation, asset),
    [asset, operation]
  );

  return (
    <>
      {!controlled && (
        <div
          {...divProps}
          onClickCapture={(e) => {
            // Stop propagation in capture phase to prevent DropdownItem from closing
            // the dropdown before we can open the modal
            e.stopPropagation();
            // Open the modal
            setData(initialData);
            setStep("form");
            setSignError(undefined);
            setInternalShow(true);
            // Close the dropdown after modal state is set
            setDropdownShow(false);
          }}
        >
          {children}
        </div>
      )}
      <Modal
        centered={true}
        size="lg"
        show={show}
        onHide={() => {
          setShow(false);
          setStep("form");
          setData(initialData);
          setSignError(undefined);
        }}
      >
        <ModalHeader closeButton={true}>
          <div className="flex items-center gap-2">
            <Button
              className={clsx(step !== "sign" && "!w-[0px] overflow-hidden")}
              noPadding={true}
              size="sm"
              icon={<UilArrowLeft />}
              iconPlacement="left"
              appearance="gray-link"
              onClick={() => setStep("form")}
              aria-label={i18next.t("g.back", { defaultValue: "Back" })}
            />
            <div className="font-normal">
              <div>{i18next.t(`${titleNamespace}.${titleKey}`)}</div>
              <div className="text-sm opacity-50">{i18next.t(`${titleNamespace}.${subTitleKey}`)}</div>
            </div>
          </div>
        </ModalHeader>

        {([
          AssetOperation.Transfer,
          AssetOperation.TransferToSavings,
          AssetOperation.PowerUp,
          AssetOperation.Gift,
          AssetOperation.Stake,
          AssetOperation.Unstake,
          AssetOperation.WithdrawFromSavings,
          AssetOperation.ClaimInterest,
          AssetOperation.Convert,
        ].includes(operation) ||
          AssetOperation.Delegate === operation) && (
          <WalletOperationsTransfer
            to={to}
            data={data}
            asset={asset}
            username={activeUser?.username ?? ""}
            operation={operation}
            showSubmit={step === "form"}
            showMemo={[
              AssetOperation.Transfer,
              AssetOperation.TransferToSavings,
              AssetOperation.WithdrawFromSavings,
              AssetOperation.Delegate,
              AssetOperation.Gift
            ].includes(operation)}
            onSubmit={(d) => {
              setData(d);
              setStep("sign");
            }}
          />
        )}
        {/* Gift-from-balance sends existing Points. When card payment is available, also
            offer buying Points to gift so a sender can top up beyond their own balance; the
            recipient is carried to /gift via ?to= and the buyer is charged there. */}
        {operation === AssetOperation.Gift && step === "form" && isStripeEnabled() && (
          <div className="px-4 pb-4 -mt-2">
            <Link
              href={to ? `/gift?to=${encodeURIComponent(to.replace(/^@/, ""))}` : "/gift"}
              className="inline-flex items-center gap-2 text-sm text-blue-dark-sky hover:underline"
            >
              <UilGift className="size-4" />
              {i18next.t("points-gift.buy-to-gift")}
            </Link>
          </div>
        )}
        {[AssetOperation.Swap].includes(operation) && <MarketSwapForm />}
        {[AssetOperation.PowerDown].includes(operation) && (
          <WalletOperationPowerDown
            asset={asset}
            username={activeUser?.username ?? ""}
            showSubmit={step === "form"}
            onSubmit={(formData) => {
              setData(formData);
              setStep("sign");
            }}
          />
        )}
        {operation === AssetOperation.WithdrawRoutes && step === "form" && (
          <WalletOperationWithdrawRoutesForm
            onSubmit={(formData) => {
              setData({ ...formData });
              setStep("sign");
            }}
          />
        )}
        {step === "sign" && (
          <WalletOperationSign
            data={data}
            asset={asset}
            operation={operation}
            onSignSuccess={() => setStep("success")}
            onSignError={(error) => {
              setStep("error");
              setSignError(error);
            }}
          />
        )}
        {step === "error" && <WalletOperationError error={signError} />}
        {step === "success" && <WalletOperationSuccess onClose={() => setShow(false)} />}

        {operation === AssetOperation.WithdrawRoutes && (
          <WalletOperationWithdrawRoutes
            onDeleteRoute={(formData) => {
              setData({
                from: activeUser?.username,
                from_account: activeUser?.username,
                to_account: formData.account,
                auto_vest: formData.auto === "yes",
                percent: 0
              });
              setStep("sign");
            }}
          />
        )}
      </Modal>
    </>
  );
}
