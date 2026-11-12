import { CONFIG, FullAccount, getAccountFullQueryOptions, PrivateKey } from "../../../../index";
import { deriveHiveKeys } from "./derive-hive-bip44-keys";

export type HiveKeyDerivation = "bip44" | "master-password" | "unknown";

export async function detectHiveKeyDerivation(
    username: string,
    seed: string,
    type: "active" | "owner" = "active"
): Promise<HiveKeyDerivation> {
  const uname = username.trim().toLowerCase();

  // ensure we actually have data
  const account = (await CONFIG.queryClient.fetchQuery(
      getAccountFullQueryOptions(uname)
  )) as FullAccount | null;
  if (!account) {
    throw new Error("[SDK][Wallets] – no account found for key derivation");
  }

  // pick the right authority based on `type`
  const auth = account[type];

  // --- BIP44 check (match selected authority) ---
  // The input may be a legacy master password (or any non-mnemonic string),
  // which @scure/bip39 rejects with "Invalid mnemonic". The previous bip39 ran
  // PBKDF2 over any string and produced a (non-matching) seed here, so guard the
  // BIP44 probe and fall through to the master-password check on failure —
  // otherwise master-password logins/signing abort before authenticating.
  let matchBip44 = false;
  try {
    const bip44 = deriveHiveKeys(seed);
    const bip44Pub = type === "owner" ? bip44.ownerPubkey : bip44.activePubkey;
    matchBip44 = auth.key_auths.some(([pub]) => String(pub) === bip44Pub);
  } catch {
    // not a valid BIP39 mnemonic -> not a BIP44 seed
  }
  if (matchBip44) return "bip44";

  // --- Master password (legacy) check (match selected authority) ---
  const legacyPub = PrivateKey.fromLogin(uname, seed, type)
      .createPublic()
      .toString();

  const matchLegacy = auth.key_auths.some(([pub]) => String(pub) === legacyPub);
  if (matchLegacy) return "master-password";

  return "unknown";
}
