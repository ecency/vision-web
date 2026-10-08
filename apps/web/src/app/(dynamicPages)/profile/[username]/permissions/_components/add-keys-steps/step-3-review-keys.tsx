import { useActiveAccount } from "@/core/hooks/use-active-account";
import { Button, StyledTooltip } from "@/features/ui";
import { getAccountFullQueryOptions, canRevokeFromAuthority } from "@ecency/sdk";
import type { Authority } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { UilArrowLeft, UilArrowRight } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { useEffect, useRef, useState } from "react";
import { useKeyDerivationStore } from "../../_hooks";
import { getLoginType } from "@/utils/user-token";
import { resolveExtensionAwareLoginType } from "@/utils/login-extension";

type Keys = Record<string, [string, number][]>;
type KeyAuthority = "owner" | "active" | "posting" | "memo";
type SigningAuthority = Exclude<KeyAuthority, "memo">;
type SelectedKeysMap = Map<string, Set<KeyAuthority>>; // publicKey -> Set of authorities

interface Props {
  /** "add" = selecting old keys to revoke alongside new keys; "revoke" = standalone revoke */
  mode?: "add" | "revoke";
  /** Pre-select this key across all authorities where it appears */
  initialSelectedKey?: string;
  onNext: (keysToRevokeByAuthority: Record<KeyAuthority, string[]>) => void;
  onBack: () => void;
}

export function Step3ReviewKeys({ mode = "add", initialSelectedKey, onNext, onBack }: Props) {
  const { activeUser } = useActiveAccount();
  const [selectedKeys, setSelectedKeys] = useState<SelectedKeysMap>(new Map());
  const getDerivation = useKeyDerivationStore((state) => state.getDerivation);
  const seededKeyRef = useRef<string | undefined>(undefined);

  const username = activeUser?.username;

  const { data: accountData } = useQuery({
    ...getAccountFullQueryOptions(username!),
    enabled: Boolean(username),
    select: (resp) =>
      resp
        ? (({
            posting: resp.posting.key_auths,
            owner: resp.owner.key_auths,
            active: resp.active.key_auths,
            memo: [[resp.memo_key, 1]]
          }) as Keys)
        : null
  });
  const { data: authorities } = useQuery({
    ...getAccountFullQueryOptions(username!),
    enabled: Boolean(username),
    select: (resp) =>
      resp
        ? ({ owner: resp.owner, active: resp.active, posting: resp.posting } as Record<
            SigningAuthority,
            Authority
          >)
        : null
  });

  // Pre-select initialSelectedKey across all authorities where it appears.
  // Only seed once per initialSelectedKey to avoid overwriting user selections on refetch.
  useEffect(() => {
    if (!initialSelectedKey || !accountData) return;
    if (seededKeyRef.current === initialSelectedKey) return;

    const initial = new Map<string, Set<KeyAuthority>>();
    const authorities: KeyAuthority[] = ["owner", "active", "posting"];

    for (const auth of authorities) {
      const keys = accountData[auth] ?? [];
      if (keys.length > 1 && keys.some(([k]) => k === initialSelectedKey)) {
        const set = initial.get(initialSelectedKey) || new Set<KeyAuthority>();
        set.add(auth);
        initial.set(initialSelectedKey, set);
      }
    }

    if (initial.size > 0) {
      setSelectedKeys(initial);
    }
    seededKeyRef.current = initialSelectedKey;
  }, [initialSelectedKey, accountData]);

  const toggleKey = (publicKey: string, authority: KeyAuthority) => {
    setSelectedKeys((prev) => {
      const next = new Map(prev);
      const authorities = next.get(publicKey) || new Set<KeyAuthority>();

      if (authorities.has(authority)) {
        authorities.delete(authority);
        if (authorities.size === 0) {
          next.delete(publicKey);
        } else {
          next.set(publicKey, authorities);
        }
      } else {
        authorities.add(authority);
        next.set(publicKey, authorities);
      }

      return next;
    });
  };

  const isKeySelected = (publicKey: string, authority: KeyAuthority) => {
    const authorities = selectedKeys.get(publicKey);
    return authorities?.has(authority) ?? false;
  };

  const getSelectedCount = () => {
    let count = 0;
    selectedKeys.forEach((authorities) => {
      count += authorities.size;
    });
    return count;
  };

  const loginType = resolveExtensionAwareLoginType(getLoginType(username ?? ""), username ?? "");

  const getLoginTypeBadge = () => {
    switch (loginType) {
      case "metamask":
        return { label: "MetaMask", className: "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300" };
      case "keychain":
        return { label: "Keychain", className: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" };
      case "keeper":
        return { label: "Keeper", className: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" };
      case "peakvault":
        return { label: "Vault", className: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300" };
      case "hivesigner":
        return { label: "HiveSigner", className: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300" };
      case "privateKey":
        return { label: i18next.t("permissions.add-keys.step3.derivation-private-key", { defaultValue: "Private Key" }), className: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400" };
      default:
        return { label: i18next.t("permissions.add-keys.step3.derivation-unknown"), className: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400" };
    }
  };

  const getDerivationBadge = (publicKey: string) => {
    const method = getDerivation(username ?? "", publicKey);

    const getBadgeConfig = () => {
      switch (method) {
        case "unknown":
          return getLoginTypeBadge();
        case "bip44":
          return {
            label: i18next.t("permissions.add-keys.step3.derivation-bip44"),
            className: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
          };
        case "master-password":
          return {
            label: i18next.t("permissions.add-keys.step3.derivation-master-password"),
            className: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
          };
      }
    };

    const config = getBadgeConfig();
    return (
      <span className={`text-xs px-2 py-0.5 rounded-full ${config.className}`}>
        {config.label}
      </span>
    );
  };

  const isRevokeMode = mode === "revoke";

  // A key can be ticked when the authority still meets its weight_threshold
  // without it (and without the keys already ticked). In "add" mode the new
  // key, weight 1, joins the authority in the same operation, so the only
  // existing key CAN be replaced; that is the normal rotation for the common
  // single-key account. In "revoke" mode nothing is added, so the last key
  // (or a multisig that would drop below threshold) stays locked.
  const canRevokeKey = (authority: SigningAuthority, publicKey: string) => {
    const auth = authorities?.[authority];
    if (!auth) return false;
    const removing = new Set<string>([publicKey]);
    selectedKeys.forEach((auths, key) => {
      if (auths.has(authority)) removing.add(key);
    });
    const withNewKey = isRevokeMode ? auth : { ...auth, weight_threshold: auth.weight_threshold - 1 };
    return canRevokeFromAuthority(withNewKey, removing);
  };

  const renderKeyType = (keyName: string) => {
    const keys = accountData?.[keyName] ?? [];
    if (keys.length === 0) return null;

    const isMemo = keyName === "memo";
    const authority = keyName as KeyAuthority;

    // In revoke mode, hide memo entirely since it can't be revoked standalone
    if (isRevokeMode && isMemo) return null;

    return (
      <div key={keyName} className="mb-4">
        <div className="text-xs opacity-50 uppercase mb-2">
          {i18next.t(`manage-authorities.${keyName}`)}
          {!isRevokeMode && isMemo && (
            <span className="ml-2 text-xs normal-case opacity-75">
              ({i18next.t("permissions.add-keys.step3.will-be-replaced")})
            </span>
          )}
        </div>
        {keys.map((key) => {
          // A ticked key stays enabled so it can be unticked.
          const canRevoke =
            !isMemo &&
            (isKeySelected(key[0], authority) ||
              canRevokeKey(authority as SigningAuthority, key[0]));
          return (
          <div
            key={key[0]}
            className="bg-gray-100 dark:bg-dark-200 border border-[--border-color] rounded-lg p-3 mb-2"
          >
            <div className="flex items-start gap-3">
              {!isMemo && (
                <input
                  type="checkbox"
                  checked={isKeySelected(key[0], authority)}
                  onChange={() => toggleKey(key[0], authority)}
                  className="mt-1"
                  disabled={!canRevoke}
                />
              )}
              {isMemo && <div className="w-4" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">{getDerivationBadge(key[0])}</div>
                <StyledTooltip content={i18next.t("chat.public-key")}>
                  <div className="font-mono text-xs truncate opacity-75">{key[0]}</div>
                </StyledTooltip>
                {!canRevoke && !isMemo && (
                  <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                    {i18next.t("permissions.add-keys.step3.cannot-revoke-last")}
                  </div>
                )}
                {!isRevokeMode && isMemo && (
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {i18next.t("permissions.add-keys.step3.memo-will-replace")}
                  </div>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    );
  };

  const title = isRevokeMode
    ? i18next.t("permissions.manage-keys.revoke-select-title")
    : i18next.t("permissions.add-keys.step3.title");

  const description = isRevokeMode
    ? i18next.t("permissions.manage-keys.revoke-select-description")
    : i18next.t("permissions.add-keys.step3.description");

  const getNextButtonLabel = () => {
    if (isRevokeMode) {
      return i18next.t("g.continue");
    }
    return getSelectedCount() > 0
      ? i18next.t("permissions.add-keys.step3.next-with-revoke")
      : i18next.t("permissions.add-keys.step3.next-skip");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={`${isRevokeMode ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"} border rounded-lg p-4`}>
        <h3 className={`font-semibold mb-2 ${isRevokeMode ? "text-red-900 dark:text-red-100" : "text-blue-900 dark:text-blue-100"}`}>
          {title}
        </h3>
        <p className={`text-sm ${isRevokeMode ? "text-red-800 dark:text-red-200" : "text-blue-800 dark:text-blue-200"}`}>
          {description}
        </p>
      </div>

      <div className="max-h-96 overflow-y-auto">
        {renderKeyType("owner")}
        {renderKeyType("active")}
        {renderKeyType("posting")}
        {renderKeyType("memo")}
      </div>

      {getSelectedCount() > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3 text-sm text-yellow-800 dark:text-yellow-200">
          {i18next.t("permissions.add-keys.step3.selected-count", {
            count: getSelectedCount()
          })}
        </div>
      )}

      <div className="flex justify-between mt-4">
        <Button appearance="gray-link" icon={<UilArrowLeft />} onClick={onBack}>
          {i18next.t("g.back")}
        </Button>
        <Button
          icon={<UilArrowRight />}
          disabled={isRevokeMode && getSelectedCount() === 0}
          onClick={() => {
            const keysToRevokeByAuthority: Record<KeyAuthority, string[]> = {
              owner: [],
              active: [],
              posting: [],
              memo: []
            };

            selectedKeys.forEach((authorities, publicKey) => {
              authorities.forEach((authority) => {
                keysToRevokeByAuthority[authority].push(publicKey);
              });
            });

            onNext(keysToRevokeByAuthority);
          }}
        >
          {getNextButtonLabel()}
        </Button>
      </div>
    </div>
  );
}
