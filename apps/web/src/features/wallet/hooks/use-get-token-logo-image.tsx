import { getAccountWalletAssetInfoQueryOptions } from "@ecency/sdk";
import {
  getAllTokensListQueryOptions
} from "@ecency/sdk/wallets";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import Image from "next/image";
import { proxifyImageSrc } from "@ecency/render-helper";
import { getSizedTokenLogo } from "../consts";
import { sanitizeWalletUsername } from "../utils/sanitize-username";

export function useGetTokenLogoImage(username: string, token: string) {
  const sanitizedUsername = useMemo(
    () => sanitizeWalletUsername(username),
    [username]
  );

  const { data: allTokens } = useQuery(
    getAllTokensListQueryOptions(sanitizedUsername)
  );

  const { data } = useQuery(
    getAccountWalletAssetInfoQueryOptions(
      sanitizedUsername,
      (token as string)?.toUpperCase()
    )
  );

  return useMemo(() => {
    const layer2Token = allTokens?.layer2?.find(
      (token) => token.symbol === data?.name.toUpperCase()
    );
    if (layer2Token) {
      return (
        <Image
          alt=""
          src={proxifyImageSrc(JSON.parse(layer2Token.metadata)?.icon, 32, 32, "match")}
          width={32}
          height={32}
          className="rounded-lg p-1 object-cover min-w-[32px] max-w-[32px] h-[32px] border border-[--border-color]"
        />
      );
    }
    if (data) {
      return getSizedTokenLogo(data.name, 36);
    }
  }, [allTokens?.layer2, data]);
}
