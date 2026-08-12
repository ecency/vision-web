"use client";

import { Alert } from "@ui/alert";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import i18next from "i18next";
import React, { useEffect, useRef, useState } from "react";
import { AccentPicker } from "./accent-picker";
import {
  ACCENT_HEX_PATTERN,
  hostingApi,
  type HostingConfigInput,
  type OwnedTenant
} from "./hosting-api";
import { obtainHostingToken } from "./hosting-token";

interface Props {
  tenant: OwnedTenant;
  /** The signed-in controlling account; the PATCH authorizes against it. */
  owner: string;
}

type ThemeChoice = "" | "system" | "light" | "dark";
const THEME_CHOICES: readonly ThemeChoice[] = ["system", "light", "dark"];

/**
 * Remote settings for a hosted instance, right in the manage panel: title,
 * description, theme and accent PATCH directly to the hosting API with a
 * Hive-signed hosting token obtained in place, no visit to the instance
 * needed. Works while a tenant is still activating too, since the PATCH
 * persists for inactive tenants and publishes on activation.
 *
 * Prefilled from the served config when the tenant is active (the config
 * endpoint answers 402 before activation); otherwise fields start blank and
 * a blank field always means "keep the current value" (the flat PATCH
 * vocabulary cannot unset).
 */
export function TenantSettings({ tenant, owner }: Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [theme, setTheme] = useState<ThemeChoice>("");
  const [accent, setAccent] = useState<string | null>(null);
  const [accentInput, setAccentInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // What the instance currently stores, so only actual edits are sent.
  const initialRef = useRef({
    title: "",
    description: "",
    theme: "" as ThemeChoice,
    accent: ""
  });
  // A save makes the fetched snapshot stale: a prefill landing after it must
  // not overwrite the post-save baseline or re-flag saved fields as edits.
  const saveStartedRef = useRef(false);

  useEffect(() => {
    if (tenant.subscriptionStatus !== "active") return;
    let cancelled = false;
    hostingApi
      .tenantConfig(tenant.username)
      .then((config) => {
        if (cancelled || saveStartedRef.current) return;
        const meta = config.configuration?.instanceConfiguration?.meta;
        const general = config.configuration?.general;
        const storedTheme = general?.theme ?? "";
        const next = {
          title: meta?.title ?? "",
          description: meta?.description ?? "",
          theme: (THEME_CHOICES as readonly string[]).includes(storedTheme)
            ? (storedTheme as ThemeChoice)
            : ("" as ThemeChoice),
          accent: general?.styles?.accent ?? ""
        };
        initialRef.current = next;
        // The form is editable while this request runs, so each fetched value
        // lands only in a field the owner has not already started editing:
        // prefill is a convenience and must never eat keystrokes. The change
        // diff still compares against the fetched snapshot either way.
        setTitle((prev) => prev || next.title);
        setDescription((prev) => prev || next.description);
        setTheme((prev) => prev || next.theme);
        setAccent((prev) => prev ?? (next.accent || null));
        setAccentInput((prev) => prev || next.accent);
      })
      // Prefill is a convenience; without it the editor still works with
      // blank-keeps-current semantics.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tenant.username, tenant.subscriptionStatus]);

  const accentPending =
    accentInput.trim().length > 0 && !ACCENT_HEX_PATTERN.test(accentInput.trim());

  // Only what actually changed travels: the flat PATCH merges what it is
  // sent, and resending an unchanged value would still be a write.
  const initial = initialRef.current;
  const changes: HostingConfigInput = {};
  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  if (trimmedTitle && trimmedTitle !== initial.title) changes.title = trimmedTitle;
  if (trimmedDescription && trimmedDescription !== initial.description) {
    changes.description = trimmedDescription;
  }
  if (theme && theme !== initial.theme) changes.theme = theme;
  if (accent && accent !== initial.accent) changes.accent = accent;
  const hasChanges = Object.keys(changes).length > 0;

  const save = async () => {
    saveStartedRef.current = true;
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const token = await obtainHostingToken(owner);
      await hostingApi.updateTenant(tenant.username, token, changes);
      initialRef.current = {
        title: changes.title ?? initial.title,
        description: changes.description ?? initial.description,
        theme: (changes.theme as ThemeChoice | undefined) ?? initial.theme,
        accent: changes.accent ?? initial.accent
      };
      setSaved(true);
    } catch (e) {
      setError((e as Error).message || i18next.t("hosting.settings-failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[--border-color] p-3">
      <p className="text-xs opacity-60">{i18next.t("hosting.settings-hint")}</p>

      <label className="text-sm font-semibold">{i18next.t("hosting.blog-title-label")}</label>
      <FormControl
        type="text"
        value={title}
        maxLength={100}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTitle(e.target.value)}
        placeholder={i18next.t("hosting.settings-keep")}
      />

      <label className="text-sm font-semibold">{i18next.t("hosting.blog-desc-label")}</label>
      <FormControl
        type="text"
        value={description}
        maxLength={500}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)}
        placeholder={i18next.t("hosting.settings-keep")}
      />

      <label className="text-sm font-semibold">{i18next.t("hosting.settings-theme-label")}</label>
      <select
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemeChoice)}
        aria-label={i18next.t("hosting.settings-theme-label")}
        className="px-3 py-2 rounded-lg border border-[--border-color] bg-transparent text-sm"
      >
        <option value="">{i18next.t("hosting.settings-keep")}</option>
        {THEME_CHOICES.map((key) => (
          <option key={key} value={key}>
            {i18next.t(`hosting.theme-${key}`)}
          </option>
        ))}
      </select>

      <label className="text-sm font-semibold">{i18next.t("hosting.accent-label")}</label>
      <AccentPicker
        value={accent}
        input={accentInput}
        onInput={(raw) => {
          setAccentInput(raw);
          const trimmed = raw.trim();
          if (!trimmed) setAccent(null);
          else if (ACCENT_HEX_PATTERN.test(trimmed)) setAccent(trimmed);
        }}
        onPick={(hex) => {
          setAccent(hex);
          setAccentInput(hex ?? "");
        }}
      />

      {error && <Alert appearance="danger">{error}</Alert>}
      {/* Persisting is not publishing: before activation the PATCH only
          stores the config, so the message must not promise a live site. */}
      {saved && !hasChanges && (
        <Alert appearance="success">
          {i18next.t(
            tenant.subscriptionStatus === "active"
              ? "hosting.settings-saved"
              : "hosting.settings-saved-pending"
          )}
        </Alert>
      )}
      <Button
        onClick={save}
        disabled={busy || accentPending || !hasChanges}
        isLoading={busy}
        full={true}
      >
        {i18next.t("hosting.settings-save")}
      </Button>
    </div>
  );
}
