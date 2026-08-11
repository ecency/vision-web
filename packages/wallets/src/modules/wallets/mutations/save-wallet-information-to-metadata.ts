import {
  AccountProfile,
  getAccountFullQueryOptions,
  useAccountUpdate,
  type AuthContext,
} from "@ecency/sdk";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { EcencyTokenMetadata } from "../types";
import * as R from "remeda";
import { getAccountWalletListQueryOptions } from "../queries";
import { EcencyWalletCurrency } from "../enums";

/**
 * A CHAIN-layer entry (external wallet address). Everything else in
 * `profile.tokens` — Hive-Engine (`ENGINE`) and the basic Hive assets (`HIVE`) —
 * is managed by the wallet token picker, not by the external-wallet screens.
 */
const isChainToken = ({
  type,
  symbol,
}: NonNullable<AccountProfile["tokens"]>[number]) =>
  type === "CHAIN" ||
  Object.values(EcencyWalletCurrency).includes(symbol as any);

function getGroupedChainTokens(
  tokens?: AccountProfile["tokens"],
  defaultShow?: boolean
) {
  if (!tokens) {
    return {};
  }

  return R.pipe(
    tokens,
    R.filter(isChainToken),
    R.map((item) => {
      const meta = {
        ...(item.meta ?? {}),
      } as Record<string, unknown>;

      if (typeof meta.show !== "boolean" && typeof defaultShow === "boolean") {
        meta.show = defaultShow;
      }

      return {
        ...item,
        meta,
      };
    }),
    // Chain tokens are unique by symbol, so indexing by symbol
    // gives a direct lookup map instead of an array-based grouping.
    R.indexBy(
      (item: NonNullable<AccountProfile["tokens"]>[number]) => item.symbol
    )
  );
}

/**
 * Assemble the `profile.tokens` array to broadcast.
 *
 * `profile.tokens` is written wholesale, so whatever this returns IS the user's
 * new on-chain token list — anything omitted is deleted, and since no app other
 * than Ecency writes this field, the deletion is unrecoverable.
 *
 * Which entries survive depends on what the caller manages, inferred from the
 * payload itself:
 *
 * - A payload carrying non-chain entries comes from the wallet token picker,
 *   which owns the COMPLETE list — it always sends the basic Hive assets plus
 *   every selected engine token, and deselecting one means omitting it. Unlisted
 *   entries are therefore dropped, which is what the user asked for.
 * - A CHAIN-only payload comes from the external-wallet screens, which know
 *   nothing about engine tokens. Their unlisted entries are carried forward.
 *
 * Inferring rather than taking a flag keeps this fix inside the package (the
 * apps resolve it through the committed dist, so a new public option could not
 * be used by a caller until the next release). It is also safe in the degenerate
 * case: if the picker somehow submits before its token list has loaded, the
 * payload is chain-only and we preserve — the non-destructive outcome.
 *
 * @param existingTokens the account's current on-chain `profile.tokens`
 * @param tokens the caller's payload
 */
export function buildTokensPayload(
  existingTokens: AccountProfile["tokens"],
  tokens: EcencyTokenMetadata[]
): AccountProfile["tokens"] {
  // Chain type tokens couldn't be deleted entirely from the profile list,
  //       then visibility should be controlling using meta.show field
  const profileChainTokens = getGroupedChainTokens(existingTokens);

  const payloadTokens =
    (tokens.map(({ currency, type, privateKey, username, ...meta }) => ({
      symbol: currency!,
      type:
        type ??
        (Object.values(EcencyWalletCurrency).includes(currency as any)
          ? "CHAIN"
          : undefined),
      meta,
    })) as AccountProfile["tokens"]) ?? [];

  const payloadChainTokens = getGroupedChainTokens(payloadTokens, true);
  const payloadNonChainTokens = (payloadTokens ?? []).filter(
    (token) => !isChainToken(token)
  );

  const mergedChainTokens = R.pipe(
    profileChainTokens,
    R.mergeDeep(payloadChainTokens),
    R.values()
  );

  // Carry forward the on-chain entries this caller does not manage. Without it,
  // saving external wallet addresses (a CHAIN-only payload) rewrites
  // `profile.tokens` to chain entries alone and silently deletes every
  // Hive-Engine token the user selected.
  const managesNonChainTokens = payloadNonChainTokens.length > 0;
  const payloadSymbols = new Set(
    (payloadTokens ?? []).map(({ symbol }) => symbol)
  );
  const preservedTokens = managesNonChainTokens
    ? []
    : (existingTokens ?? []).filter(
        (token) => !isChainToken(token) && !payloadSymbols.has(token.symbol)
      );

  return [
    ...preservedTokens,
    ...payloadNonChainTokens,
    ...mergedChainTokens,
  ] as AccountProfile["tokens"];
}

/**
 * Saving of token(s) metadata to Hive profile
 * It may contain: external wallets(see EcencyWalletCurrency), Hive tokens arrangement
 *
 * Basically, this mutation is a convenient wrapper for update profile operation
 */
type SaveWalletInformationOptions = Pick<
  UseMutationOptions<unknown, Error, EcencyTokenMetadata[]>,
  "onSuccess" | "onError"
>;

export function useSaveWalletInformationToMetadata(
  username: string,
  auth?: AuthContext,
  options?: SaveWalletInformationOptions
) {
  const queryClient = useQueryClient();

  const { data: accountData } = useQuery(getAccountFullQueryOptions(username));
  const { mutateAsync: updateProfile } = useAccountUpdate(username, auth);

  return useMutation({
    mutationKey: [
      "ecency-wallets",
      "save-wallet-to-metadata",
      accountData?.name,
    ],
    mutationFn: async (tokens: EcencyTokenMetadata[]) => {
      if (!accountData) {
        throw new Error("[SDK][Wallets] – no account data to save wallets");
      }

      return updateProfile({
        tokens: buildTokensPayload(accountData.profile?.tokens, tokens),
      });
    },
    onError: options?.onError,
    onSuccess: (response, vars, context) => {
      (
        options?.onSuccess as
          | ((
              data: unknown,
              variables: EcencyTokenMetadata[],
              context: unknown
            ) => unknown)
          | undefined
      )?.(response, vars, context);
      queryClient.invalidateQueries({
        queryKey: getAccountWalletListQueryOptions(username).queryKey,
      });
    },
  });
}
