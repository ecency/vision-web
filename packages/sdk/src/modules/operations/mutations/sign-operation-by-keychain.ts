import type { Operation } from "../../../hive-tx";
import { useMutation } from "@tanstack/react-query";
import type { AuthContextV2 } from "@/modules/core/types";

export function useSignOperationByKeychain(
  username: string | undefined,
  auth?: AuthContextV2,
  keyType: "owner" | "active" | "posting" | "memo" = "active"
) {
  return useMutation({
    mutationKey: ["operations", "sign-keychain", username],
    mutationFn: ({ operation }: { operation: Operation }) => {
      if (!username) {
        throw new Error(
          "[SDK][Keychain] – cannot sign operation with anon user"
        );
      }
      if (!auth?.adapter?.broadcastWithKeychain) {
        throw new Error("[SDK][Keychain] – missing keychain broadcaster");
      }

      return auth.adapter.broadcastWithKeychain(username, [operation], keyType);
    },
  });
}
