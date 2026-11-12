import bnbSvg from "@/assets/img/currencies/bnb.svg";
import btcSvg from "@/assets/img/currencies/btc.svg";
import ethSvg from "@/assets/img/currencies/eth.svg";
import solSvg from "@/assets/img/currencies/solana.svg";
import { EcencyWalletCurrency } from "@ecency/sdk/wallets";

export const CURRENCIES_META_DATA = {
  [EcencyWalletCurrency.BTC]: {
    title: "Bitcoin",
    icon: btcSvg,
    name: "BTC"
  },
  [EcencyWalletCurrency.ETH]: {
    title: "Ethereum",
    icon: ethSvg,
    name: "ETH"
  },
  [EcencyWalletCurrency.SOL]: {
    title: "Solana",
    icon: solSvg,
    name: "SOL"
  },
  [EcencyWalletCurrency.BNB]: {
    title: "BNB Chain",
    icon: bnbSvg,
    name: "BNB"
  }
} as const;
