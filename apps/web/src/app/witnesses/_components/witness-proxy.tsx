import { useState } from "react";
import { formatError } from "@/api/format-error";
import { Spinner } from "@ui/spinner";
import { FormControl } from "@ui/input";
import { Button } from "@ui/button";
import { error, LoginRequired } from "@/features/shared";
import i18next from "i18next";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useWitnessProxyMutation } from "@/api/sdk-mutations";
import { accountExists, isValidAccountName, normalizeAccountName } from "@/utils/hive-account-name";
import { useQueryClient } from "@tanstack/react-query";
import "./witness-proxy.scss";

interface Props {
  onDone: () => void;
}

export function WitnessesProxy({ onDone }: Props) {
  const { activeUser } = useActiveAccount();

  const [username, setUsername] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [checking, setChecking] = useState(false);
  const queryClient = useQueryClient();
  const { mutateAsync, isPending } = useWitnessProxyMutation();
  const proxy = normalizeAccountName(username);
  // The chain refuses a proxy to yourself, so say so before the user signs.
  const isSelfProxy = !!activeUser && proxy === activeUser.username;
  const canSetProxy = isValidAccountName(username) && !isSelfProxy;
  const busy = isPending || checking;

  const setProxy = async () => {
    if (!canSetProxy || busy) {
      return;
    }
    setChecking(true);
    try {
      if (!(await accountExists(queryClient, proxy))) {
        setNotFound(true);
        return;
      }
    } catch (e) {
      error(...formatError(e));
      return;
    } finally {
      setChecking(false);
    }

    try {
      await mutateAsync({ proxy });
      onDone();
      setUsername("");
    } catch (e) {
      error(...formatError(e));
    }
  };

  return (
    <div className="witnesses-proxy">
      <p className="description">{i18next.t("witnesses.proxy-description")}</p>
      <div className="proxy-form">
        <div className="txt-username">
          <FormControl
            type="text"
            placeholder={i18next.t("witnesses.username-placeholder")}
            value={username}
            maxLength={20}
            onChange={(e) => {
              setUsername(e.target.value.trim());
              setNotFound(false);
            }}
            disabled={busy}
            aria-invalid={isSelfProxy || notFound}
          />
          {isSelfProxy && (
            <div className="text-sm px-2 text-red">{i18next.t("witnesses.proxy-self-error")}</div>
          )}
          {notFound && (
            <div className="text-sm px-2 text-red">{i18next.t("validation.account-not-found")}</div>
          )}
        </div>
        <div>
          {activeUser ? (
            canSetProxy ? (
              <Button
                disabled={busy}
                icon={busy && <Spinner className="mr-[6px] size-3.5" />}
                iconPlacement="left"
                onClick={setProxy}
              >
                {i18next.t("witnesses.proxy-btn-label")}
              </Button>
            ) : (
              <Button disabled={true}>{i18next.t("witnesses.proxy-btn-label")}</Button>
            )
          ) : (
            <LoginRequired>
              <Button
                disabled={isPending}
                icon={isPending && <Spinner className="mr-[6px] size-3.5" />}
                iconPlacement="left"
              >
                {i18next.t("witnesses.proxy-btn-label")}
              </Button>
            </LoginRequired>
          )}
        </div>
      </div>
    </div>
  );
}
