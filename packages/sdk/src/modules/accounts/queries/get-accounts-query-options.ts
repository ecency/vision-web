import { queryOptions } from "@tanstack/react-query";
import { QueryKeys } from "@/modules/core";
import { parseAccounts } from "../utils/parse-accounts";
import { FullAccount } from "../types";
import { callRPC } from "@/modules/core/hive-tx";
import { isQueryableAccountName } from "../utils/account-name-query";

export function getAccountsQueryOptions(usernames: string[]) {
  return queryOptions({
    queryKey: QueryKeys.accounts.list(...usernames),
    enabled: usernames.length > 0,
    queryFn: async (): Promise<FullAccount[]> => {
      // One unholdable name asserts the whole batch, so drop those first. They
      // cannot name an existing account, and an empty result is what a caller
      // checking "does this account exist" already handles.
      const queryable = usernames.filter(isQueryableAccountName);
      if (queryable.length === 0) {
        return [];
      }

      // A correct node always answers get_accounts with an array — a null
      // result in a well-formed envelope is a node fault (observed in the
      // wild), so the validator makes callRPC fail over to the next node
      // instead of resolving with a payload parseAccounts cannot map over.
      const response = (await callRPC(
        "condenser_api.get_accounts",
        [queryable],
        undefined,
        undefined,
        undefined,
        (rows) => Array.isArray(rows)
      )) as any[];
      return parseAccounts(response ?? []);
    },
  });
}
