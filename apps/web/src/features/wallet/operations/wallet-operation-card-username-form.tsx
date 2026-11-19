import { UserAvatar } from "@/features/shared";
import { Button, FormControl, InputGroup } from "@/features/ui";
import { Spinner } from "@/features/ui/spinner";
import { yupResolver } from "@hookform/resolvers/yup";
import { UilEnter } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { Controller, useForm } from "react-hook-form";
import { useEffect, useMemo, useRef, useState } from "react";
import * as yup from "yup";
import { getBadActorsQueryOptions, lookupAccountsQueryOptions } from "@ecency/sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { accountExists, isValidAccountName, normalizeAccountName } from "@/utils/hive-account-name";
import { error as showError } from "@/features/shared";
import { formatError } from "@/api/format-error";

const form = yup.object({
  username: yup
    .string()
    .required(i18next.t("validation.required"))
    .min(2, i18next.t("sign-up.username-max-length-error"))
    .test("hive-account-name", i18next.t("validation.invalid-account-name"), isValidAccountName)
});

interface Props {
  onUsernameSubmit?: (name: string) => void;
}

export function WalletOperationCardUsernameForm({ onUsernameSubmit }: Props) {
  const queryClient = useQueryClient();
  const methods = useForm({
    resolver: yupResolver(form),
    defaultValues: {
      username: ""
    }
  });

  const error = methods.formState.errors.username?.message?.toString();
  const [isFocused, setIsFocused] = useState(false);
  // Hides the suggestions shortly after blur, so a click on one still lands. Cleared on unmount so
  // it never sets state on a form that is gone.
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(blurTimer.current), []);
  const usernameValue = methods.watch("username") ?? "";
  const normalizedUsername = useMemo(() => usernameValue.trim(), [usernameValue]);
  const [debouncedUsername, setDebouncedUsername] = useState(normalizedUsername);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedUsername(normalizedUsername.toLowerCase());
    }, 250);

    return () => clearTimeout(handler);
  }, [normalizedUsername]);

  const { data: badActors } = useQuery(getBadActorsQueryOptions());
  const { data: suggestions = [], isFetching } = useQuery(
    lookupAccountsQueryOptions(debouncedUsername, debouncedUsername.length > 0 ? 5 : 0)
  );
  const badActorWarning = useMemo(
    () =>
      debouncedUsername && badActors?.has(debouncedUsername)
        ? i18next.t("transfer.to-bad-actor")
        : "",
    [badActors, debouncedUsername]
  );
  const showSuggestions = isFocused && normalizedUsername.length > 0;
  // A typed name must be an existing account before it is used: Hive Engine
  // and POINTS operations are custom_json, which the chain accepts whatever
  // the recipient, so a typo would send the tokens nowhere (#2122). A picked
  // suggestion comes from lookup_accounts and needs no second check.
  const submit = methods.handleSubmit(async ({ username }) => {
    try {
      const exists = await accountExists(queryClient, username);
      // The user may have changed the name while it was being checked.
      if (methods.getValues("username") !== username) {
        return;
      }
      if (!exists) {
        methods.setError("username", { message: i18next.t("validation.account-not-found") });
        return;
      }
    } catch (e) {
      showError(...formatError(e));
      return;
    }
    // The name as checked: trimmed and lowercased.
    onUsernameSubmit?.(normalizeAccountName(username));
  });

  const handleSuggestionSelect = (name: string) => {
    methods.setValue("username", name, {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true
    });
    methods.clearErrors("username");
    onUsernameSubmit?.(name);
    setIsFocused(false);
  };

  return (
    <form className="px-4" onSubmit={submit}>
      <div className="relative">
        <InputGroup append={<Button type="submit" appearance="gray-link" icon={<UilEnter />} aria-label={i18next.t("g.confirm", { defaultValue: "Confirm" })} />}>
          <Controller
            control={methods.control}
            name="username"
            render={({ field }) => (
              <FormControl
                {...field}
                value={field.value ?? ""}
                type="text"
                placeholder={i18next.t("g.username")}
                aria-invalid={!!error}
                autoComplete="off"
                onFocus={() => {
                  clearTimeout(blurTimer.current);
                  setIsFocused(true);
                }}
                onChange={(event) => {
                  const sanitizedValue = event.target.value.replace(/^@/, "").toLowerCase();
                  field.onChange(sanitizedValue);
                }}
                onBlur={(event) => {
                  field.onBlur();
                  clearTimeout(blurTimer.current);
                  blurTimer.current = setTimeout(() => setIsFocused(false), 150);
                  submit(event);
                }}
              />
            )}
          />
        </InputGroup>

        {showSuggestions && (
          <div className="animate-scale-in origin-top absolute left-0 right-0 z-20 mt-1 max-h-60 overflow-y-auto rounded-md border border-[--border-color] bg-white text-sm shadow-lg dark:bg-gray-900">
            {isFetching ? (
              <div className="flex items-center gap-2 px-3 py-2 text-gray-500 dark:text-gray-300">
                <Spinner className="size-4" />
                {i18next.t("g.loading")}
              </div>
            ) : suggestions.length === 0 ? (
              <div className="px-3 py-2 text-gray-500 dark:text-gray-300">
                {i18next.t("g.no-matches")}
              </div>
            ) : (
              <ul className="py-1">
                {suggestions.map((name) => (
                  <li
                    key={name}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-black hover:bg-gray-100 dark:text-white dark:hover:bg-gray-800"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      handleSuggestionSelect(name);
                    }}
                  >
                    <UserAvatar size="small" username={name} />
                    <span>@{name}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {error && (
        <div key={error} className="animate-fade-in-up text-red text-xs px-3 pt-0.5">
          {error}
        </div>
      )}
      {badActorWarning && (
        <div className="animate-fade-in-up text-warning-default text-xs px-3 pt-0.5">
          {badActorWarning}
        </div>
      )}
    </form>
  );
}
