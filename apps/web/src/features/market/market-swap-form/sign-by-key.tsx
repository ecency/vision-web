import React, { useEffect, useRef, useState } from "react";
import { PrivateKey } from "@ecency/sdk";
import { isWif } from "@ecency/sdk";
import { FormControl, InputGroup } from "@ui/input";
import { Button } from "@ui/button";
import { useGlobalStore } from "@/core/global-store";
import { error } from "@/features/shared";
import { keySvg } from "@ui/svg";
import i18next from "i18next";
import { useActiveAccount } from "@/core/hooks/use-active-account";

export interface Props {
  onKey: (key: PrivateKey) => void;
  onBack: () => void;
  isLoading: boolean;
}

export const SignByKey = ({ onKey, onBack, isLoading }: Props) => {
  const { activeUser } = useActiveAccount();
  const signingKey = useGlobalStore((s) => s.signingKey);
  const setSigningKey = useGlobalStore((s) => s.setSigningKey);

  const [key, setKey] = useState("");

  // The field follows the store's key. When the store drops it (idle limit,
  // logout), a key the field still shows goes too; text the user typed since
  // stays.
  const shownKey = useRef<string | null>(null);
  useEffect(() => {
    if (signingKey) {
      shownKey.current = signingKey;
      setKey(signingKey);
    } else if (shownKey.current) {
      const dropped = shownKey.current;
      shownKey.current = null;
      setKey((current) => (current === dropped ? "" : current));
    }
  }, [signingKey]);

  const generateKey = () => {
    let pKey: PrivateKey;

    if (isWif(key)) {
      // wif
      try {
        pKey = PrivateKey.fromString(key);
      } catch (e) {
        error("Invalid active private key!");
        return;
      }
    } else {
      // master key
      pKey = PrivateKey.fromLogin(activeUser!.username, key, "active");
    }
    setKey(key);
    onKey(pKey);
    // The store keeps the derived key, never a typed master password.
    setSigningKey(pKey.toString());
  };

  return (
    <div className="mt-4">
      <InputGroup prepend={keySvg}>
        <FormControl
          value={key}
          type="password"
          autoFocus={true}
          autoComplete="off"
          placeholder={i18next.t("key-or-hot.key-placeholder")}
          disabled={isLoading}
          onChange={(e) => setKey(e.target.value)}
        />
      </InputGroup>
      <div className="flex">
        <Button appearance="link" className="w-full mt-4 flex-1 mr-3" onClick={onBack}>
          {i18next.t("market.back")}
        </Button>
        <Button className="w-full mt-4 flex-1" onClick={() => generateKey()} disabled={isLoading}>
          {isLoading ? i18next.t("market.signing") : i18next.t("market.sign")}
        </Button>
      </div>
    </div>
  );
};
