"use client";

import { useEffect, useRef, useState } from "react";
import i18next from "i18next";
import type { PostRecoveryCleanupItem, PrivateKey } from "@ecency/sdk";
import { Button } from "@ui/button";
import { Spinner } from "@ui/spinner";
import {
  loadCleanupItems,
  submitCleanupItems
} from "@/features/account-recovery/recovery-chain";

interface Props {
  username: string;
  activeKey: PrivateKey;
  onDone: () => void;
}

/**
 * Optional: undo wallet changes found on the account. Every row starts checked
 * and is sent as its own transaction; rows that worked are dropped, failed ones
 * stay for another try.
 */
export function RecoverCleanupStep({ username, activeKey, onDone }: Props) {
  const [items, setItems] = useState<PostRecoveryCleanupItem[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let active = true;
    loadCleanupItems(username)
      .then((found) => {
        if (!active) return;
        if (found.length === 0) {
          done.current();
          return;
        }
        setItems(found);
        setSelected(new Set(found.map((i) => i.id)));
      })
      .catch(() => {
        // Clean-up is optional: if it cannot be read, finish without it.
        if (active) done.current();
      });
    return () => {
      active = false;
    };
  }, [username]);

  const apply = async () => {
    if (!items) return;
    const chosen = items.filter((i) => selected.has(i.id));
    if (chosen.length === 0) {
      onDone();
      return;
    }
    setBusy(true);
    try {
      const results = await submitCleanupItems(username, chosen, activeKey);
      const failedIds = new Set(results.filter((r) => !r.ok).map((r) => r.id));
      if (failedIds.size === 0) {
        onDone();
        return;
      }
      const remaining = items.filter((i) => failedIds.has(i.id));
      setItems(remaining);
      setSelected(new Set(remaining.map((i) => i.id)));
      setFailed(failedIds);
    } finally {
      setBusy(false);
    }
  };

  if (!items) {
    return <Spinner className="size-6 mx-auto my-6" />;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">{i18next.t("recover-account.cleanup.title")}</h2>
      <p className="text-sm opacity-75 mb-4">{i18next.t("recover-account.cleanup.hint")}</p>
      <fieldset className="flex flex-col gap-2 mb-4" disabled={busy}>
        {items.map((item) => (
          <label key={item.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              onChange={(e) =>
                setSelected((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(item.id);
                  else next.delete(item.id);
                  return next;
                })
              }
            />
            <span>
              {i18next.t(`recover-account.cleanup.items.${item.kind}`, { target: item.target })}
            </span>
            {failed.has(item.id) && (
              <span className="text-red text-xs">{i18next.t("recover-account.cleanup.item-failed")}</span>
            )}
          </label>
        ))}
      </fieldset>
      {failed.size > 0 && (
        <p role="alert" className="text-sm text-red mb-3">
          {i18next.t("recover-account.cleanup.failed")}
        </p>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={apply} disabled={busy} isLoading={busy}>
          {i18next.t("recover-account.cleanup.apply")}
        </Button>
        <Button className="flex-1" appearance="secondary" onClick={onDone} disabled={busy}>
          {i18next.t("recover-account.cleanup.skip")}
        </Button>
      </div>
    </div>
  );
}
