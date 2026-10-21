import React from "react";
import { FormProvider, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { InferType } from "yup";
import i18next from "i18next";
import { Button, FormControl } from "@/features/ui";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { getBadActorsQueryOptions } from "@ecency/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatError } from "@/api/format-error";
import { error } from "@/features/shared";
import { accountExists, isValidAccountName, normalizeAccountName } from "@/utils/hive-account-name";

// Define schema outside the component to prevent recreation on each render
const schema = yup.object({
  account: yup
    .string()
    .required(i18next.t("withdraw-routes.validation-account"))
    .test("hive-account-name", i18next.t("validation.invalid-account-name"), isValidAccountName),
  percent: yup.number().required(i18next.t("withdraw-routes.validation-percent")).min(0).max(100),
  auto: yup.string().required()
});

export type WithdrawRoutesFormData = InferType<typeof schema>;

interface WithdrawRouteParams {
  from: string;
  from_account: string;
  to_account: string;
  percent: number;
  auto_vest: boolean;
}

interface Props {
  onSubmit: (data: WithdrawRouteParams) => void;
  initialValues?: Partial<WithdrawRoutesFormData>;
}

export function WalletOperationWithdrawRoutesForm({ onSubmit, initialValues }: Props) {
  const { activeUser } = useActiveAccount();
  const { data: badActors } = useQuery(getBadActorsQueryOptions());
  const queryClient = useQueryClient();
  const methods = useForm<WithdrawRoutesFormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      account: initialValues?.account || "",
      percent: initialValues?.percent || 10,
      auto: initialValues?.auto || "yes"
    }
  });

  return (
    <FormProvider {...methods}>
      <form
        className="border-b border-[--border-color] p-4 items-end grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        onSubmit={methods.handleSubmit(async (data) => {
          const toAccount = normalizeAccountName(data.account);
          // Catch a typo before the sign step: the chain would reject it anyway.
          try {
            if (!(await accountExists(queryClient, toAccount))) {
              methods.setError("account", { message: i18next.t("validation.account-not-found") });
              return;
            }
          } catch (e) {
            error(...formatError(e));
            return;
          }
          onSubmit({
            from: activeUser!.username,
            from_account: activeUser!.username,
            to_account: toAccount,
            auto_vest: data.auto === "yes",
            percent: data.percent * 100
          });
        })}
      >
        <div className="lg:col-span-3">
          <label>{i18next.t("withdraw-routes.account")}</label>
          <FormControl
            {...methods.register("account")}
            type="text"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck="false"
            aria-invalid={!!methods.formState.errors.account}
          />
          {methods.formState.errors.account && (
            <div className="animate-fade-in-up text-red text-xs px-3 pt-0.5">
              {methods.formState.errors.account.message}
            </div>
          )}
          {badActors?.has(normalizeAccountName(methods.watch("account"))) && (
            <div className="animate-fade-in-up text-warning-default text-xs px-3 pt-0.5">
              {i18next.t("transfer.to-bad-actor")}
            </div>
          )}
        </div>
        <div>
          <label>{i18next.t("withdraw-routes.percent")}</label>
          <FormControl
            {...methods.register("percent", { valueAsNumber: true })}
            type="number"
            aria-invalid={!!methods.formState.errors.percent}
          />
          {methods.formState.errors.percent && (
            <div className="animate-fade-in-up text-red text-xs px-3 pt-0.5">
              {methods.formState.errors.percent.message}
            </div>
          )}
        </div>
        <div>
          <label>{i18next.t("withdraw-routes.auto-power-up")}</label>
          <FormControl {...methods.register("auto")} type="select">
            <option value="yes">{i18next.t("g.yes")}</option>
            <option value="no">{i18next.t("g.no")}</option>
          </FormControl>
        </div>
        <Button
          appearance="gray"
          size="lg"
          full={true}
          type="submit"
          disabled={methods.formState.isSubmitting}
        >
          {i18next.t("g.add")}
        </Button>
      </form>
    </FormProvider>
  );
}
