"use client";

import { getAccessToken } from "@/utils";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@ui/alert";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import i18next from "i18next";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccentPicker } from "../hosting-signup/accent-picker";
import {
  ACCENT_HEX_PATTERN,
  FONT_PRESETS,
  hostingApi,
  type HostingTemplate
} from "../hosting-signup/hosting-api";
import { TemplatePicker } from "../hosting-signup/template-picker";

const BASE_DOMAIN = "blogs.ecency.com";

interface Props {
  /** The authenticated Ecency Pro member. Its HiveSigner token authorizes the claim. */
  username: string;
}

/**
 * "Claim your free blog" surface for Ecency Pro members. Ecency Pro bundles a free blog at
 * {username}.blogs.ecency.com; this action idempotently activates it via the web proxy
 * (/api/hosting/claim-blog), then links to the blog and the Custom domain upgrade. The proxy
 * re-checks Pro membership server-side, so this is safe even if rendered for a non-member.
 *
 * The claim passes through the same customize step as the paid signup: template, accent, fonts
 * and an identity prefilled from the member's profile, so a claimed blog starts out looking like
 * its owner rather than like the default template.
 */
export function ProBlogClaim({ username }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blogUrl, setBlogUrl] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [styleTemplate, setStyleTemplate] = useState<string | null>(null);
  const [accent, setAccent] = useState<string | null>(null);
  const [accentInput, setAccentInput] = useState("");
  const [fontPreset, setFontPreset] = useState<string | null>(null);
  const [templates, setTemplates] = useState<HostingTemplate[] | null>(null);
  const [templatesFailed, setTemplatesFailed] = useState(false);

  const subdomain = `${username}.${BASE_DOMAIN}`;

  // The template catalog, like the paid signup: a load failure must not block
  // the claim, the blog just starts on the default look.
  useEffect(() => {
    let cancelled = false;
    hostingApi
      .templates()
      .then((r) => {
        if (!cancelled) setTemplates(r.templates);
      })
      .catch(() => {
        if (!cancelled) setTemplatesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Identity prefill from the member's profile, once. The claimant is fixed
  // (their own account), so the signup's name-change bookkeeping is not
  // needed here; empty fields are simply seeded and stay editable.
  const { data: prefillAccount } = useQuery(getAccountFullQueryOptions(username));
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current || !prefillAccount) return;
    prefilledRef.current = true;
    const profile = (
      prefillAccount as { profile?: { name?: unknown; about?: unknown } } | undefined
    )?.profile;
    if (profile?.name) setTitle((prev) => prev || String(profile.name).slice(0, 100));
    if (profile?.about) setDescription((prev) => prev || String(profile.about).slice(0, 500));
  }, [prefillAccount]);

  const claim = useCallback(async () => {
    setError("");
    const code = getAccessToken(username) ?? "";
    if (!code) {
      setError(i18next.t("pro-blog.login-required"));
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/hosting/claim-blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          title: title.trim() || undefined,
          description: description.trim() || undefined,
          styleTemplate: styleTemplate ?? undefined,
          accent: accent ?? undefined,
          fontPreset: fontPreset ?? undefined
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 403) setError(i18next.t("pro-blog.not-pro"));
        else if (r.status === 503) setError(i18next.t("pro-blog.unavailable"));
        else setError(data?.error || i18next.t("pro-blog.claim-failed"));
        return;
      }
      setBlogUrl(data?.tenant?.blogUrl || `https://${subdomain}`);
    } catch {
      setError(i18next.t("pro-blog.claim-failed"));
    } finally {
      setBusy(false);
    }
  }, [username, subdomain, title, description, styleTemplate, accent, fontPreset]);

  if (blogUrl) {
    return (
      <Alert appearance="success">
        <div className="flex flex-col gap-2">
          <strong>{i18next.t("pro-blog.claimed-title")}</strong>
          <a href={blogUrl} target="_blank" rel="noreferrer" className="text-blue-dark-sky underline">
            {blogUrl}
          </a>
          <p className="text-sm opacity-75">{i18next.t("pro-blog.custom-domain-upsell")}</p>
          <Link href="/hosting" className="text-blue-dark-sky hover:underline text-sm font-semibold">
            {i18next.t("pro-blog.add-custom-domain")}
          </Link>
        </div>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-[--border-color] p-4">
      <div className="font-semibold">{i18next.t("pro-blog.title")}</div>
      <p className="text-sm opacity-75">
        {i18next.t("pro-blog.includes", { subdomain })}
      </p>

      <p className="text-sm opacity-75">{i18next.t("hosting.customize-hint")}</p>

      <label className="text-sm font-semibold">{i18next.t("hosting.template-label")}</label>
      <TemplatePicker
        templates={templates}
        failed={templatesFailed}
        value={styleTemplate}
        onChange={setStyleTemplate}
      />

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

      <label className="text-sm font-semibold">{i18next.t("hosting.fonts-label")}</label>
      <select
        value={fontPreset ?? ""}
        onChange={(e) => setFontPreset(e.target.value || null)}
        aria-label={i18next.t("hosting.fonts-label")}
        className="px-3 py-2 rounded-lg border border-[--border-color] bg-transparent text-sm"
      >
        <option value="">{i18next.t("hosting.font-default")}</option>
        {FONT_PRESETS.map((key) => (
          <option key={key} value={key}>
            {i18next.t(`hosting.font-${key}`)}
          </option>
        ))}
      </select>

      <label className="text-sm font-semibold">{i18next.t("hosting.blog-title-label")}</label>
      <FormControl
        type="text"
        value={title}
        onChange={(e: any) => setTitle(e.target.value)}
        placeholder={i18next.t("hosting.blog-title-placeholder")}
      />
      <label className="text-sm font-semibold">{i18next.t("hosting.blog-desc-label")}</label>
      <FormControl
        type="text"
        value={description}
        onChange={(e: any) => setDescription(e.target.value)}
        placeholder={i18next.t("hosting.blog-desc-placeholder")}
      />

      {error && <Alert appearance="danger">{error}</Alert>}
      <Button onClick={claim} disabled={busy} isLoading={busy} full={true}>
        {i18next.t("pro-blog.claim")}
      </Button>
    </div>
  );
}

export default ProBlogClaim;
