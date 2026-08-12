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
  /**
   * How long the requests the claim gates on (the template catalog and the
   * existence probe) may keep it waiting before they degrade: the catalog to
   * an ordinary load failure, the probe to claimable. A connection that
   * neither resolves nor rejects must not disable claiming forever.
   */
  settleTimeoutMs?: number;
}

/** What the mount probe and a raced claim know about an existing blog. */
interface ExistingBlog {
  blogUrl?: string;
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
export function ProBlogClaim({ username, settleTimeoutMs = 10_000 }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blogUrl, setBlogUrl] = useState("");
  // 'pending' while the mount probe runs; an ExistingBlog replaces the whole
  // form (the claim would return it unchanged, applying none of the fields);
  // null means claimable.
  const [existing, setExisting] = useState<ExistingBlog | "pending" | null>("pending");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [styleTemplate, setStyleTemplate] = useState<string | null>(null);
  const [accent, setAccent] = useState<string | null>(null);
  const [accentInput, setAccentInput] = useState("");
  const [fontPreset, setFontPreset] = useState<string | null>(null);
  const [templates, setTemplates] = useState<HostingTemplate[] | null>(null);
  const [templatesFailed, setTemplatesFailed] = useState(false);

  const subdomain = `${username}.${BASE_DOMAIN}`;

  // The field is mid-edit and unusable: neither empty (template default) nor
  // a committed valid hex.
  const accentPending =
    accentInput.trim().length > 0 && !ACCENT_HEX_PATTERN.test(accentInput.trim());

  // The template catalog, like the paid signup: a load failure must not
  // block the claim, the blog just starts on the default look. Bounded: the
  // claim button waits for the catalog to settle, so a request that neither
  // resolves nor rejects times out into the same failure state instead of
  // disabling the claim forever. First outcome wins; a late arrival after
  // the timeout is ignored rather than un-failing a form the member may
  // already be reading.
  useEffect(() => {
    let cancelled = false;
    let settled = false;
    const timer = setTimeout(() => {
      if (!cancelled && !settled) {
        settled = true;
        setTemplatesFailed(true);
      }
    }, settleTimeoutMs);
    hostingApi
      .templates()
      .then((r) => {
        if (!cancelled && !settled) {
          settled = true;
          // An empty roster would render a blank picker; the failure message
          // (with the claim still allowed) is the honest state for it.
          if (r.templates.length > 0) setTemplates(r.templates);
          else setTemplatesFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled && !settled) {
          settled = true;
          setTemplatesFailed(true);
        }
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [settleTimeoutMs]);

  // Whether this member's blog already exists: the claim endpoint returns an
  // existing live tenant UNCHANGED, so presenting editable customization for
  // it would report success while applying nothing. An existing blog swaps
  // the form for a manage pointer; only an unknown name (or an abandoned
  // reservation, which a claim revives) is claimable. Fail open on probe
  // errors: the form still works and the claim itself answers honestly.
  useEffect(() => {
    let cancelled = false;
    let settled = false;
    // Bounded like the catalog: this probe also gates the claim button, so a
    // stalled request fails open to claimable instead of disabling claiming
    // forever. The race that lets through (a blog that does exist) is safe:
    // the endpoint returns it unchanged with created: false and the claim
    // shows the already-exists state.
    const timer = setTimeout(() => {
      if (!cancelled && !settled) {
        settled = true;
        setExisting(null);
      }
    }, settleTimeoutMs);
    hostingApi
      .tenant(username)
      .then((t) => {
        if (cancelled || settled) return;
        settled = true;
        setExisting(
          t.subscriptionStatus === "abandoned" ? null : { blogUrl: t.blogUrl }
        );
      })
      .catch(() => {
        if (!cancelled && !settled) {
          settled = true;
          setExisting(null);
        }
      })
      .finally(() => clearTimeout(timer));
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username, settleTimeoutMs]);

  // Identity prefill from the member's profile, once. The claimant is fixed
  // (their own account), so the signup's name-change bookkeeping is not
  // needed here; empty fields are simply seeded and stay editable.
  const { data: prefillAccount, isFetched: prefillSettled } = useQuery(
    getAccountFullQueryOptions(username)
  );

  // The claim is one-shot (an existing live tenant is returned unchanged), so
  // a click before the catalog, the profile prefill and the existence probe
  // SETTLE would lock in a default-looking config the claimant never saw
  // coming. Failures still settle: a dead catalog or profile degrades to
  // claiming without them, and the catalog settles by timeout at the latest.
  const customizeSettled =
    (templates !== null || templatesFailed) && prefillSettled && existing !== "pending";

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
      // A raced claim (the blog appeared between the probe and the click) is
      // returned unchanged with none of the customization applied; showing
      // the plain success would claim otherwise.
      if (data?.created === false) {
        setExisting({ blogUrl: data?.tenant?.blogUrl || `https://${subdomain}` });
        return;
      }
      setBlogUrl(data?.tenant?.blogUrl || `https://${subdomain}`);
    } catch {
      setError(i18next.t("pro-blog.claim-failed"));
    } finally {
      setBusy(false);
    }
  }, [username, subdomain, title, description, styleTemplate, accent, fontPreset]);

  // Already set up: the claim would return this blog unchanged, so instead of
  // a form whose every field would be silently discarded, point at the blog
  // and at the manage panel where settings can actually be changed.
  if (existing && existing !== "pending") {
    return (
      <Alert appearance="primary">
        <div className="flex flex-col gap-2">
          <strong>{i18next.t("pro-blog.already-title")}</strong>
          {existing.blogUrl && (
            <a
              href={existing.blogUrl}
              target="_blank"
              rel="noreferrer"
              className="text-blue-dark-sky underline"
            >
              {existing.blogUrl}
            </a>
          )}
          <p className="text-sm opacity-75">{i18next.t("pro-blog.already-note")}</p>
          <Link href="/hosting" className="text-blue-dark-sky hover:underline text-sm font-semibold">
            {i18next.t("pro-blog.manage-link")}
          </Link>
        </div>
      </Alert>
    );
  }

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
      {/* A mid-edit invalid accent must block the claim, same as the paid
          signup: the committed value silently differing from the visible
          input is exactly the surprise this guards against. */}
      <Button
        onClick={claim}
        disabled={busy || accentPending || !customizeSettled}
        isLoading={busy}
        full={true}
      >
        {i18next.t("pro-blog.claim")}
      </Button>
    </div>
  );
}

export default ProBlogClaim;
