"use client";

import { formatError } from "@/api/format-error";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { error, success } from "@/features/shared";
import { KeyOrHot } from "@/features/shared/key-or-hot";
import {
  getAccountFullQueryOptions,
  getAccountPendingRecoveryQueryOptions,
  getAccountRecoveriesQueryOptions,
  useAccountUpdateRecovery
} from "@ecency/sdk";
import { PrivateKey } from "@ecency/sdk";
import { buildHsCallbackUrl } from "@/utils/hs-callback";
import { yupResolver } from "@hookform/resolvers/yup";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UilEditAlt } from "@tooni/iconscout-unicons-react";
import { Button } from "@ui/button";
import { FormControl, InputGroup } from "@ui/input";
import { Modal, ModalBody, ModalHeader } from "@ui/modal";
import i18next from "i18next";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { getAccessToken, getSdkAuthContext, getUser } from "@/utils";
import { accountExists, normalizeAccountName } from "@/utils/hive-account-name";
import { computeRecoverySubmitState, recoveryFormSchema } from "./account-recovery-utils";

const ECENCY = "ecency";

export function AccountRecovery() {
  const { activeUser } = useActiveAccount();

  const { data } = useQuery(getAccountFullQueryOptions(activeUser?.username));
  const { data: recoveries } = useQuery(
    getAccountRecoveriesQueryOptions(
      activeUser?.username,
      getAccessToken(activeUser?.username ?? "")
    )
  );
  const { data: pendingRecovery } = useQuery(
    getAccountPendingRecoveryQueryOptions(activeUser?.username)
  );
  const [formInitiated, setFormInitiated] = useState(false);
  const [keyDialog, setKeyDialog] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(false);
  const queryClient = useQueryClient();

  const methods = useForm({
    resolver: yupResolver(recoveryFormSchema),
    defaultValues: {
      newRecoveryAccount: "",
      recoveryEmail: "",
      isEcency: false
    },
    mode: "onChange"
  });
  // The raw field may hold "@Name " - everything below works on the cleaned name.
  const newRecoveryAccount = normalizeAccountName(methods.watch("newRecoveryAccount"));
  // Gating logic lives in a pure helper (account-recovery-utils) so it can be unit-tested.
  const { isSelfRecovery, showUpdate, canSubmit } = computeRecoverySubmitState({
    newRecoveryAccount,
    currentRecoveryAccount: data?.recovery_account,
    activeUsername: activeUser?.username,
    formInitiated
  });

  const { mutateAsync: updateRecovery, isPending } = useAccountUpdateRecovery(
    activeUser?.username,
    getAccessToken(activeUser?.username ?? ""),
    {
      onError: (e) => error(...formatError(e)),
      onSuccess: () => success(i18next.t("account-recovery.success-message")),
      hsCallbackUrl: buildHsCallbackUrl(`/@${activeUser?.username}/permissions`)
    },
    getSdkAuthContext(getUser(activeUser?.username ?? ""))
  );

  const update = useCallback(async () => {
    // Enforce the same gate as the Update button so an Enter-key form submit can't bypass it:
    // no submit when the recovery account is unchanged (showUpdate=false) or is self-recovery.
    if (!canSubmit || checkingAccount) {
      return;
    }
    // Catch a typo before the owner key is asked for: the chain would reject it anyway.
    setCheckingAccount(true);
    try {
      if (!(await accountExists(queryClient, newRecoveryAccount))) {
        methods.setError("newRecoveryAccount", {
          message: i18next.t("validation.account-not-found")
        });
        return;
      }
      setKeyDialog(true);
    } catch (e) {
      error(...formatError(e));
    } finally {
      setCheckingAccount(false);
    }
  }, [canSubmit, checkingAccount, methods, newRecoveryAccount, queryClient]);
  const handleSign = useCallback(
    async (type: Parameters<typeof updateRecovery>[0]["type"], key?: PrivateKey) => {
      const { isEcency, recoveryEmail, newRecoveryAccount } = methods.getValues();
      const accountName = normalizeAccountName(newRecoveryAccount);
      if (isEcency || accountName === ECENCY) {
        await updateRecovery({
          type: "ecency",
          email: recoveryEmail,
          accountName
        });
      }

      await updateRecovery({
        type,
        key,
        accountName
      });

      setKeyDialog(false);
    },
    [methods, updateRecovery]
  );

  useEffect(() => {
    methods.setValue("recoveryEmail", recoveries?.[0]?.email);
  }, [recoveries]);

  useEffect(() => {
    // Only seed the field once the account has actually loaded. `data` going
    // back to undefined (remount, cache eviction) would otherwise blank a
    // recovery account that was already loaded, or overwrite what the user is
    // in the middle of typing. defaultValues already supplies the empty state.
    if (!data) {
      return;
    }

    methods.setValue("newRecoveryAccount", data.recovery_account ?? "");
    methods.setValue("isEcency", data.recovery_account === ECENCY);
  }, [data]);

  useEffect(() => {
    methods.setValue("isEcency", newRecoveryAccount === ECENCY);
  }, [newRecoveryAccount]);

  return (
    <div className="rounded-xl bg-white/80 dark:bg-dark-200/90 text-gray-900 dark:text-white">
      <div className="px-4 pt-4 pb-1 text-sm md:text-lg font-bold">
        {i18next.t("permissions.recovery.title")}
      </div>
      <div className="px-4 text-sm opacity-75 mb-4">{i18next.t("permissions.recovery.hint")}</div>
      <form className="px-4 pb-4 flex flex-col gap-4" onSubmit={methods.handleSubmit(update)}>
        <div>
          <label className="mb-2 text-sm opacity-50 px-2">
            {i18next.t("account-recovery.curr-recovery-acc")}
          </label>
          <FormControl
            {...methods.register("newRecoveryAccount")}
            type="text"
            autoFocus={true}
            autoComplete="off"
            aria-invalid={!!methods.formState.errors.newRecoveryAccount}
          />
          <div className="text-sm px-2 text-red">
            {methods.formState.errors.newRecoveryAccount?.message}
          </div>
          {isSelfRecovery && (
            <div className="text-sm px-2 text-red">
              {i18next.t("account-recovery.same-account-error")}
            </div>
          )}
        </div>

        {methods.getValues().isEcency && (
          <div>
            <label className="mb-2 text-sm opacity-50 px-2">
              {i18next.t("account-recovery.new-recovery-email")}
            </label>
            <InputGroup
                append={
                    !formInitiated && (
                        <Button
                            appearance="gray"
                            icon={<UilEditAlt />}
                            aria-label={i18next.t("g.edit", { defaultValue: "Edit" })}
                            onClick={() => setFormInitiated(true)}
                        />
                    )
                }
            >
              <FormControl
                  {...methods.register("recoveryEmail")}
                  disabled={!formInitiated}
                  type="email"
                  autoFocus={true}
                  autoComplete="off"
                  aria-invalid={!!methods.formState.errors.recoveryEmail}
              />
            </InputGroup>
            <div className="text-sm px-2 text-red">
              {methods.formState.errors.recoveryEmail?.message}
            </div>
          </div>
        )}

        <div className="w-full flex flex-end">
          {showUpdate && (
              <Button size="sm" type="submit" disabled={isSelfRecovery || checkingAccount}>
                {i18next.t("g.update")}
              </Button>
          )}
        </div>
      </form>

      <Modal
        show={keyDialog}
        centered={true}
        onHide={() => setKeyDialog(false)}
        className="recovery-dialog"
        size="lg"
      >
        <ModalHeader closeButton={true}>{i18next.t("account-recovery.sign-title")}</ModalHeader>
        <ModalBody>
          <KeyOrHot
            inProgress={isPending}
            authority="owner"
            onKey={(key) => handleSign("key", key)}
            onKc={() => handleSign("keychain")}
            onHot={() => handleSign("hivesigner")}
            onMetaMask={() => handleSign("keychain")}
          />
        </ModalBody>
      </Modal>
    </div>
  );
}
