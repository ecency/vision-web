import { ConfigManager } from "../../../../../index";
import { useMutation } from "@tanstack/react-query";
import { getBoundFetch } from "../../utils/get-bound-fetch";

interface Payload {
  tokens: Record<string, string>;
  hiveKeys: {
    ownerPublicKey: string;
    activePublicKey: string;
    postingPublicKey: string;
    memoPublicKey: string;
  };
}

export function useUpdateAccountWithWallets(
  username: string,
  accessToken: string | undefined
) {
  const fetchApi = getBoundFetch();

  return useMutation({
    mutationKey: ["ecency-wallets", "update-account-with-wallets", username],
    mutationFn: async ({ tokens, hiveKeys }: Payload) => {
      const entries = Object.entries(tokens).filter(([, address]) => Boolean(address));

      if (entries.length === 0) {
        return new Response(null, { status: 204 });
      }

      const [primaryToken, primaryAddress] = entries[0] ?? ["", ""];

      if (!accessToken) {
        throw new Error(
          "[SDK][Wallets][PrivateApi][WalletsAdd] – access token wasn`t found"
        );
      }

      const response = await fetchApi(`${ConfigManager.getValidatedBaseUrl()}/private-api/wallets-add`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          code: accessToken,
          token: primaryToken,
          address: primaryAddress,
          status: 3,
          meta: {
            ...Object.fromEntries(entries),
            ownerPublicKey: hiveKeys.ownerPublicKey,
            activePublicKey: hiveKeys.activePublicKey,
            postingPublicKey: hiveKeys.postingPublicKey,
            memoPublicKey: hiveKeys.memoPublicKey,
          },
        }),
      });

      // Raw fetch resolves on 4xx/5xx; guard so a failed wallet-add doesn't run
      // onSuccess as if the account had been updated.
      if (!response.ok) {
        throw new Error(
          `[SDK][Wallets][PrivateApi][WalletsAdd] – request failed: ${response.status}`
        );
      }

      return response;
    },
  });
}
