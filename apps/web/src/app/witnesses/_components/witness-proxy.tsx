import { useState } from "react";
import { formatError } from "@/api/format-error";
import { Spinner } from "@ui/spinner";
import { FormControl } from "@ui/input";
import { Button } from "@ui/button";
import { error, LoginRequired } from "@/features/shared";
import i18next from "i18next";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useWitnessProxyMutation } from "@/api/sdk-mutations";
import { isValidAccountName, normalizeAccountName } from "@/utils/hive-account-name";
import "./witness-proxy.scss";

interface Props {
  onDone: () => void;
}

export function WitnessesProxy({ onDone }: Props) {
  const { activeUser } = useActiveAccount();

  const [username, setUsername] = useState("");
  const { mutateAsync, isPending } = useWitnessProxyMutation();
  const canSetProxy = isValidAccountName(username);

  const setProxy = async () => {
    try {
      await mutateAsync({ proxy: normalizeAccountName(username) });
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
            onChange={(e) => setUsername(e.target.value.trim())}
            disabled={isPending}
          />
        </div>
        <div>
          {activeUser ? (
            canSetProxy ? (
              <Button
                disabled={isPending}
                icon={isPending && <Spinner className="mr-[6px] size-3.5" />}
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
