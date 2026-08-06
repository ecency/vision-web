import { PrivateKey } from "../../../hive-tx";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { getAccountFullQueryOptions } from "../queries";
import { FullAccount } from "../types";
import hs from "hivesigner";
import type { AuthContextV2 } from "@/modules/core/types";
import { broadcastOperations } from "@/modules/core/hive-tx";

type SignType = "key" | "keychain" | "hivesigner";

interface CommonPayload {
  accountName: string;
  type: SignType;
  key?: PrivateKey;
}

type RevokePostingOptions = Pick<
  UseMutationOptions<unknown, Error, CommonPayload>,
  "onSuccess" | "onError"
> & {
  hsCallbackUrl?: string;
};

export function useAccountRevokePosting(
  username: string | undefined,
  options: RevokePostingOptions,
  auth?: AuthContextV2
) {
  const queryClient = useQueryClient();

  const { data } = useQuery(getAccountFullQueryOptions(username));

  return useMutation({
    mutationKey: ["accounts", "revoke-posting", data?.name],
    mutationFn: async ({ accountName, type, key }: CommonPayload) => {
      if (!data) {
        throw new Error(
          "[SDK][Accounts] – cannot revoke posting for anonymous user"
        );
      }

      const posting = JSON.parse(JSON.stringify(data.posting)) as FullAccount["posting"];

      posting.account_auths = posting.account_auths.filter(
        ([account]) => account !== accountName
      );

      const operationBody = {
        account: data.name,
        posting,
        memo_key: data.memo_key,
        json_metadata: data.json_metadata,
      };

      if (type === "key" && key) {
        return broadcastOperations([["account_update", operationBody]], key);
      } else if (type === "keychain") {
        if (!auth?.adapter?.broadcastWithKeychain) {
          throw new Error("[SDK][Accounts] – missing keychain broadcaster");
        }
        return auth.adapter.broadcastWithKeychain(
          data.name,
          [["account_update", operationBody]],
          "active"
        );
      } else {
        if (!options.hsCallbackUrl && process.env.NODE_ENV === "development") {
          console.warn("[SDK][Accounts] hsCallbackUrl not provided for HiveSigner revoke-posting; user will not be redirected after signing.");
        }
        return hs.sendOperation(
          ["account_update", operationBody],
          options.hsCallbackUrl ? { callback: options.hsCallbackUrl } : {},
          () => {}
        );
      }
    },
    onError: options.onError,
    onSuccess: (resp, payload, ctx) => {
      (options.onSuccess as
        | ((data: unknown, variables: CommonPayload, context: unknown) => unknown)
        | undefined)?.(resp, payload, ctx);
      queryClient.setQueryData<FullAccount>(
        getAccountFullQueryOptions(username).queryKey,
        (data) =>
          ({
            ...data,
            posting: {
              ...data?.posting,
              account_auths:
                data?.posting?.account_auths?.filter(
                  ([account]) => account !== payload.accountName
                ) ?? [],
            },
          }) as FullAccount
      );
    },
  });
}
