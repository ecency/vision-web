import { formatError } from "@/api/format-error";
import { updateAccountKeysCache } from "@/api/mutations/update-account-keys-cache";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { error, success } from "@/features/shared";
import { KeyOrHot } from "@/features/shared/key-or-hot";
import { Button, Modal, ModalBody, ModalHeader } from "@/features/ui";
import {
  getAccountFullQueryOptions,
  useAccountRevokeKey,
  buildRevokeKeysOp,
  canRevokeFromAuthority
} from "@ecency/sdk";
import { PrivateKey, PublicKey } from "@ecency/sdk";
import type { Operation } from "@ecency/sdk";
import { getWebBroadcastAdapter } from "@/providers/sdk/web-broadcast-adapter";
import {
  UilArrowLeft,
  UilCheckCircle,
  UilKeySkeleton,
  UilSpinner,
  UilTrash
} from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Step2GenerateSeed,
  Step3ReviewKeys,
  Step4Confirm
} from "./add-keys-steps";

type Mode = "choose" | "add" | "revoke";
type AddStep = "generate" | "review" | "confirm";
type RevokeStep = "select" | "sign";
type KeyAuthority = "owner" | "active" | "posting" | "memo";

interface Props {
  show: boolean;
  onHide: () => void;
  initialRevokeKey?: string;
}

export function ManageKeysDialog({ show, onHide, initialRevokeKey }: Props) {
  const { activeUser } = useActiveAccount();
  const username = activeUser?.username;
  const queryClient = useQueryClient();

  const { data: accountData } = useQuery({
    ...getAccountFullQueryOptions(username ?? ""),
    enabled: !!username
  });

  // Can only show the revoke option if at least one authority has enough
  // weight to survive removing a key (respects multisig weight_threshold).
  const canRevoke = accountData
    ? [accountData.owner, accountData.active, accountData.posting].some((auth) =>
        auth.key_auths.length > 1 &&
        auth.key_auths.some(([key]) => {
          const without = new Set([String(key)]);
          return canRevokeFromAuthority(auth, without);
        })
      )
    : false;

  const [mode, setMode] = useState<Mode>("choose");

  // Add flow state
  const [addStep, setAddStep] = useState<AddStep>("generate");
  const [masterPassword, setMasterPassword] = useState("");
  const [keysToRevokeByAuthority, setKeysToRevokeByAuthority] = useState<
    Record<KeyAuthority, string[]>
  >({ owner: [], active: [], posting: [], memo: [] });

  // Revoke flow state
  const [revokeStep, setRevokeStep] = useState<RevokeStep>("select");
  const [revokeKeysMap, setRevokeKeysMap] = useState<Record<KeyAuthority, string[]>>({
    owner: [],
    active: [],
    posting: [],
    memo: []
  });
  const [isRevoking, setIsRevoking] = useState(false);
  const [isRevokeComplete, setIsRevokeComplete] = useState(false);

  // Reset state when modal opens/closes or initialRevokeKey changes
  useEffect(() => {
    if (show) {
      if (initialRevokeKey) {
        setMode("revoke");
        setRevokeStep("select");
      } else {
        setMode("choose");
      }
      setAddStep("generate");
      setMasterPassword("");
      setKeysToRevokeByAuthority({ owner: [], active: [], posting: [], memo: [] });
      setRevokeKeysMap({ owner: [], active: [], posting: [], memo: [] });
      setIsRevoking(false);
      setIsRevokeComplete(false);
    }
  }, [show, initialRevokeKey]);

  const handleClose = useCallback(() => {
    onHide();
  }, [onHide]);

  const getTitle = () => {
    if (mode === "choose") return i18next.t("permissions.manage-keys.title");
    if (mode === "add") return i18next.t("permissions.manage-keys.add-title");
    return i18next.t("permissions.manage-keys.revoke-title");
  };

  // Total keys being revoked
  const getRevokeCount = () =>
    Object.values(revokeKeysMap).reduce((sum, keys) => sum + keys.length, 0);

  return (
    <Modal centered={true} show={show} onHide={handleClose}>
      <ModalHeader closeButton={true}>{getTitle()}</ModalHeader>
      <ModalBody>
        {mode === "choose" && (
          <ActionChooser
            canRevoke={canRevoke}
            onAdd={() => setMode("add")}
            onRevoke={() => {
              setMode("revoke");
              setRevokeStep("select");
            }}
          />
        )}

        {mode === "add" && (
          <AddFlow
            username={username!}
            addStep={addStep}
            masterPassword={masterPassword}
            keysToRevokeByAuthority={keysToRevokeByAuthority}
            onGenerateNext={(password) => {
              setMasterPassword(password);
              setAddStep("review");
            }}
            onReviewNext={(keys) => {
              setKeysToRevokeByAuthority(keys);
              setAddStep("confirm");
            }}
            onBack={() => {
              if (addStep === "generate") setMode("choose");
              else if (addStep === "review") setAddStep("generate");
              else if (addStep === "confirm") setAddStep("review");
            }}
            onSuccess={handleClose}
          />
        )}

        {mode === "revoke" && (
          <RevokeFlow
            username={username!}
            revokeStep={revokeStep}
            revokeKeysMap={revokeKeysMap}
            revokeCount={getRevokeCount()}
            isRevoking={isRevoking}
            isRevokeComplete={isRevokeComplete}
            initialSelectedKey={initialRevokeKey}
            onSelectNext={(keys) => {
              setRevokeKeysMap(keys);
              setRevokeStep("sign");
            }}
            onBack={() => {
              if (revokeStep === "select") {
                if (initialRevokeKey) {
                  handleClose();
                } else {
                  setMode("choose");
                }
              } else {
                setRevokeStep("select");
              }
            }}
            onSignStart={() => setIsRevoking(true)}
            onSignError={() => setIsRevoking(false)}
            onSuccess={() => {
              setIsRevokeComplete(true);

              // Optimistic cache update + background refetch
              updateAccountKeysCache(queryClient, username!, {
                revokeMap: revokeKeysMap
              });

              success(i18next.t("permissions.manage-keys.revoke-success"));
              setTimeout(handleClose, 1500);
            }}
          />
        )}
      </ModalBody>
    </Modal>
  );
}

// --- Action Chooser ---

function ActionChooser({ canRevoke, onAdd, onRevoke }: { canRevoke: boolean; onAdd: () => void; onRevoke: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm opacity-75 mb-2">
        {i18next.t("permissions.manage-keys.choose-title")}
      </div>

      <button
        className="flex items-start gap-4 p-4 rounded-lg border border-[--border-color] hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors text-left"
        onClick={onAdd}
      >
        <UilKeySkeleton className="size-8 text-blue-500 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-gray-900 dark:text-white">
            {i18next.t("permissions.manage-keys.add-title")}
          </div>
          <div className="text-sm opacity-75 mt-1">
            {i18next.t("permissions.manage-keys.add-description")}
          </div>
        </div>
      </button>

      {canRevoke && (
        <button
          className="flex items-start gap-4 p-4 rounded-lg border border-[--border-color] hover:border-red-400 dark:hover:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-left"
          onClick={onRevoke}
        >
          <UilTrash className="size-8 text-red-500 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-gray-900 dark:text-white">
              {i18next.t("permissions.manage-keys.revoke-title")}
            </div>
            <div className="text-sm opacity-75 mt-1">
              {i18next.t("permissions.manage-keys.revoke-description")}
            </div>
          </div>
        </button>
      )}
    </div>
  );
}

// --- Add Flow ---

function AddFlow({
  username,
  addStep,
  masterPassword,
  keysToRevokeByAuthority,
  onGenerateNext,
  onReviewNext,
  onBack,
  onSuccess
}: {
  username: string;
  addStep: AddStep;
  masterPassword: string;
  keysToRevokeByAuthority: Record<KeyAuthority, string[]>;
  onGenerateNext: (password: string) => void;
  onReviewNext: (keys: Record<KeyAuthority, string[]>) => void;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const steps = [
    i18next.t("permissions.add-keys.stepper.generate-seed"),
    i18next.t("permissions.add-keys.stepper.review-keys"),
    i18next.t("permissions.add-keys.stepper.confirm")
  ];

  const currentStepIndex = addStep === "generate" ? 0 : addStep === "review" ? 1 : 2;

  return (
    <div>
      <StepIndicator steps={steps} currentStep={currentStepIndex} />
      <div className="mt-4">
        {addStep === "generate" && (
          <Step2GenerateSeed username={username} onNext={onGenerateNext} onBack={onBack} />
        )}
        {addStep === "review" && (
          <Step3ReviewKeys mode="add" onNext={onReviewNext} onBack={onBack} />
        )}
        {addStep === "confirm" && (
          <Step4Confirm
            masterPassword={masterPassword}
            keysToRevokeByAuthority={keysToRevokeByAuthority}
            onBack={onBack}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </div>
  );
}

// --- Revoke Flow ---

function RevokeFlow({
  username,
  revokeStep,
  revokeKeysMap,
  revokeCount,
  isRevoking,
  isRevokeComplete,
  initialSelectedKey,
  onSelectNext,
  onBack,
  onSignStart,
  onSignError,
  onSuccess
}: {
  username: string;
  revokeStep: RevokeStep;
  revokeKeysMap: Record<KeyAuthority, string[]>;
  revokeCount: number;
  isRevoking: boolean;
  isRevokeComplete: boolean;
  initialSelectedKey?: string;
  onSelectNext: (keys: Record<KeyAuthority, string[]>) => void;
  onBack: () => void;
  onSignStart: () => void;
  onSignError: () => void;
  onSuccess: () => void;
}) {
  const steps = [
    i18next.t("permissions.manage-keys.revoke-step-select"),
    i18next.t("permissions.manage-keys.revoke-step-sign")
  ];

  const currentStepIndex = revokeStep === "select" ? 0 : 1;

  return (
    <div>
      <StepIndicator steps={steps} currentStep={currentStepIndex} />
      <div className="mt-4">
        {revokeStep === "select" && (
          <Step3ReviewKeys
            mode="revoke"
            initialSelectedKey={initialSelectedKey}
            onNext={onSelectNext}
            onBack={onBack}
          />
        )}
        {revokeStep === "sign" && (
          <RevokeConfirmStep
            username={username}
            keysToRevoke={revokeKeysMap}
            revokeCount={revokeCount}
            isRevoking={isRevoking}
            isComplete={isRevokeComplete}
            onBack={onBack}
            onSignStart={onSignStart}
            onSignError={onSignError}
            onSuccess={onSuccess}
          />
        )}
      </div>
    </div>
  );
}

// --- Revoke Confirm Step ---

function RevokeConfirmStep({
  username,
  keysToRevoke,
  revokeCount,
  isRevoking,
  isComplete,
  onBack,
  onSignStart,
  onSignError,
  onSuccess
}: {
  username: string;
  keysToRevoke: Record<KeyAuthority, string[]>;
  revokeCount: number;
  isRevoking: boolean;
  isComplete: boolean;
  onBack: () => void;
  onSignStart: () => void;
  onSignError: () => void;
  onSuccess: () => void;
}) {
  // Collect all unique public keys to revoke across all authorities
  const allRevokingKeys: PublicKey[] = [];
  const seen = new Set<string>();
  for (const keys of [keysToRevoke.owner, keysToRevoke.active, keysToRevoke.posting]) {
    for (const k of keys) {
      if (!seen.has(k)) {
        seen.add(k);
        allRevokingKeys.push(PublicKey.from(k));
      }
    }
  }

  // Determine the minimum authority level needed for signing.
  // Hive requires owner authority only when the owner field is included
  // in the account_update operation; otherwise active authority suffices.
  const requiredAuthority: "owner" | "active" =
    keysToRevoke.owner.length > 0 ? "owner" : "active";

  const queryClient = useQueryClient();
  const { mutateAsync: revokeKeys } = useAccountRevokeKey(username);

  // Direct key signing - delegates to SDK mutation
  const handleSignByKey = async (privateKey: PrivateKey) => {
    onSignStart();
    try {
      await revokeKeys({ currentKey: privateKey, revokingKey: allRevokingKeys });
      onSuccess();
    } catch (err: any) {
      onSignError();
      error(...formatError(err));
    }
  };

  // Keychain/MetaMask signing - uses shared SDK op builder, broadcasts via adapter
  const handleSignByKeychain = async () => {
    onSignStart();
    try {
      const account = await queryClient.fetchQuery(
        getAccountFullQueryOptions(username)
      );
      if (!account) throw new Error("Account data not loaded");

      const opPayload = buildRevokeKeysOp(account, allRevokingKeys);
      const op = ["account_update", opPayload] as unknown as Operation;

      const adapter = getWebBroadcastAdapter();
      await adapter.broadcastWithKeychain!(username, [op], requiredAuthority);
      onSuccess();
    } catch (err: any) {
      onSignError();
      error(...formatError(err));
    }
  };

  if (isComplete) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <UilCheckCircle className="size-16 text-green-500" />
        <h3 className="text-xl font-semibold">
          {i18next.t("permissions.manage-keys.revoke-success")}
        </h3>
      </div>
    );
  }

  if (isRevoking) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <UilSpinner className="size-16 animate-spin opacity-50" />
        <h3 className="text-xl font-semibold">
          {i18next.t("permissions.add-keys.step4.applying")}
        </h3>
        <p className="text-sm opacity-75">
          {i18next.t("permissions.add-keys.step4.please-wait")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <h3 className="font-semibold text-red-900 dark:text-red-100 mb-2">
          {i18next.t("permissions.manage-keys.revoke-confirm-title")}
        </h3>
        <p className="text-sm text-red-800 dark:text-red-200">
          {i18next.t("permissions.manage-keys.revoke-confirm-description")}
        </p>
      </div>

      <div className="bg-white dark:bg-dark-200 border border-[--border-color] rounded-lg p-4">
        <div className="text-xs opacity-50 uppercase mb-1">
          {i18next.t("permissions.add-keys.step4.revoking")}
        </div>
        <div className="text-sm text-red-600 dark:text-red-400">
          {i18next.t("permissions.manage-keys.revoke-count", { count: revokeCount })}
        </div>
      </div>

      <KeyOrHot
        inProgress={isRevoking}
        onKey={handleSignByKey}
        onKc={handleSignByKeychain}
        onMetaMask={handleSignByKeychain}
        authority={requiredAuthority}
      />

      <div className="flex justify-start mt-2">
        <Button appearance="gray-link" icon={<UilArrowLeft />} onClick={onBack}>
          {i18next.t("g.back")}
        </Button>
      </div>
    </div>
  );
}

// --- Shared Step Indicator ---

function StepIndicator({ steps, currentStep }: { steps: string[]; currentStep: number }) {
  return (
    <div className="flex items-center justify-between mb-2 px-4">
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;

        return (
          <div key={index} className="flex items-center flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  isCompleted
                    ? "bg-green-500 text-white"
                    : isActive
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                }`}
              >
                {index + 1}
              </div>
              <div
                className={`text-xs mt-1 text-center transition-colors ${
                  isActive
                    ? "text-blue-600 dark:text-blue-400 font-semibold"
                    : "text-gray-500 dark:text-gray-400"
                }`}
              >
                {step}
              </div>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`h-0.5 flex-1 transition-colors ${
                  isCompleted ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
