import { FormControl, StyledTooltip } from "@/features/ui";
import i18next from "i18next";
import { useFormContext } from "react-hook-form";

interface Props {
  readonly: boolean;
  showMemo: boolean;
  /** The asset's smallest amount (0.001, or 1e-8 for an 8-decimal engine token). */
  step?: number;
}

export function WalletOperationAmountForm({ readonly, showMemo, step = 0.001 }: Props) {
  const methods = useFormContext();

  const amountError = methods.formState.errors.amount?.message?.toString();
  const memoError = methods.formState.errors.memo?.message?.toString();

  return (
    <div className="grid lg:grid-cols-2 px-4 gap-4 items-start">
      <div>
        <div className="uppercase text-xs pb-2 font-semibold text-gray-600 dark:text-gray-400">
          amount
        </div>

        <FormControl
          {...methods.register("amount")}
          type="number"
          step={step}
          readOnly={readonly}
          placeholder="0.01"
          aria-invalid={!!amountError}
        />
        {amountError && (
          <div key={amountError} className="animate-fade-in-up text-red text-xs px-3 pt-0.5">
            {amountError}
          </div>
        )}
      </div>

      {showMemo && (
        <div>
          <div className="uppercase text-xs pb-2 font-semibold text-gray-600 dark:text-gray-400">
            memo
          </div>
          <StyledTooltip content={i18next.t("transfer.memo-help")}>
            <FormControl
              {...methods.register("memo")}
              type="text"
              readOnly={readonly}
              placeholder="Memo"
              aria-invalid={!!memoError}
            />
          </StyledTooltip>
          {memoError && (
            <div key={memoError} className="animate-fade-in-up text-red text-xs px-3 pt-0.5">
              {memoError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
