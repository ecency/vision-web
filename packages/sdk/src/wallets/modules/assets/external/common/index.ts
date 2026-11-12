import { CONFIG, FullAccount, getAccountFullQueryOptions } from "../../../../../index";

export async function getAddressFromAccount(
  username: string,
  tokenName: string
) {
  await CONFIG.queryClient.prefetchQuery(getAccountFullQueryOptions(username));
  const account = CONFIG.queryClient.getQueryData<FullAccount>(
    getAccountFullQueryOptions(username).queryKey
  );
  const address = account?.profile?.tokens?.find((t) => t.symbol === tokenName)
    ?.meta?.address;

  if (!address) {
    throw new Error(
      "[SDK][Wallets] – cannot fetch APT balance with empty adrress"
    );
  }

  return address;
}
