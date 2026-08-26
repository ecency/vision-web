"use client";

import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useTransferMutation } from "@/api/sdk-mutations";
import { ensureValidToken, getLoginType } from "@/utils/user-token";
import { useGlobalStore } from "@/core/global-store";
import { getUsernameError } from "@/utils/username-validation";
import { Alert } from "@ui/alert";
import { Button } from "@ui/button";
import { FormControl } from "@ui/input";
import i18next from "i18next";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  hostingApi,
  hostingSkuForMonths,
  hostingProSkuForMonths,
  isValidCommunityId,
  ACCENT_HEX_PATTERN,
  FONT_PRESETS,
  HOSTING_CUSTOM_DOMAIN_MONTHLY_USD,
  type HostingPaymentMethods,
  type HostingTemplate
} from "./hosting-api";
import { CustomDomainManager } from "./custom-domain-manager";
import { TemplatePicker } from "./template-picker";
import { AccentPicker } from "./accent-picker";
import { DestinationPicker, type HostingDestination } from "./destination-picker";
import { useDownloadSelfHostBundle } from "./use-download-self-host-bundle";
import { getAccountFullQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";

// Lazy-load the card checkout so /hosting doesn't pull @stripe/stripe-js (which injects the
// js.stripe.com script on import) into its bundle until the user actually picks "card".
const HostingCardCheckout = dynamic(
  () => import("./hosting-card-checkout").then((m) => m.HostingCardCheckout),
  {
    ssr: false,
    loading: () => (
      <div className="py-6 text-center text-sm opacity-75">
        {i18next.t("hosting.preparing-checkout")}
      </div>
    )
  }
);

type Step = "username" | "customize" | "payment" | "success";
type Method = "hbd" | "card";
type InstanceType = "blog" | "community";

const TERMS = [1, 3, 6, 12];

/** Font pairing keys the hosting API accepts; labels live in i18n. */

/** localStorage key for an in-progress customization, so an abandoned tab resumes. */
const customizeDraftKey = (name: string) => `ecency:hosting:customize:${name}`;

interface CustomizeDraft {
  styleTemplate?: string | null;
  accent?: string | null;
  fontPreset?: string | null;
  title?: string;
  description?: string;
}

/** Older than any reservation grace window; a stale draft must not resurrect. */
const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function readCustomizeDraft(name: string): CustomizeDraft | null {
  try {
    const raw = localStorage.getItem(customizeDraftKey(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const savedAt = (parsed as { savedAt?: number }).savedAt;
    if (typeof savedAt === "number" && Date.now() - savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(customizeDraftKey(name));
      return null;
    }
    return parsed as CustomizeDraft;
  } catch {
    return null;
  }
}

// sessionStorage key for a one-click HBD payment that was broadcast but not yet confirmed. Lets a
// redirecting signer (or a page reload) resume polling for activation on return. Session-scoped so
// it never lingers past the tab.
const PENDING_HBD_KEY = "ecency:hosting:pending-hbd";

function clearPendingHbd() {
  try {
    sessionStorage.removeItem(PENDING_HBD_KEY);
  } catch {}
}

interface Instructions {
  to: string;
  amount: string;
  memo: string;
}

export function HostingSignup() {
  const { activeUser } = useActiveAccount();
  const toggleUIProp = useGlobalStore((s) => s.toggleUiProp);

  const [step, setStep] = useState<Step>("username");
  // Personal blog (default) vs a Hive community hosted as its own site.
  const [instanceType, setInstanceType] = useState<InstanceType>("blog");
  const [username, setUsername] = useState(activeUser?.username ?? "");
  const [communityId, setCommunityId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  // The look, chosen on the customize step. null everywhere means the default
  // look: skipping the step entirely must produce exactly today's defaults.
  const [styleTemplate, setStyleTemplate] = useState<string | null>(null);
  const [accent, setAccent] = useState<string | null>(null);
  const [accentInput, setAccentInput] = useState("");
  const [fontPreset, setFontPreset] = useState<string | null>(null);
  const [templates, setTemplates] = useState<HostingTemplate[] | null>(null);
  const [templatesFailed, setTemplatesFailed] = useState(false);
  // Where this blog will live. Managed is the default: the self-host branch
  // is free and creates nothing, so it must be chosen deliberately, and
  // nothing about it may touch the reservation the managed path makes.
  const [destination, setDestination] = useState<HostingDestination>("managed");
  const [selfHostDomain, setSelfHostDomain] = useState("");
  const [months, setMonths] = useState(1);
  // Custom domain add-on: switches to the $3/mo "prohosting" plan so the tenant activates on the
  // internal pro plan and can attach a custom domain after checkout.
  const [customDomain, setCustomDomain] = useState(false);
  const [method, setMethod] = useState<Method>("card");
  const [methods, setMethods] = useState<HostingPaymentMethods | null>(null);
  const [instructions, setInstructions] = useState<Instructions | null>(null);
  const [blogUrl, setBlogUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Card confirmed -> the term/method are locked so a remount can't cancel the activation poll.
  const [paying, setPaying] = useState(false);
  // True while a card Pay submit is in flight (validate, mint, confirm). The term, add-on
  // and method controls must be frozen for that whole window: once confirmPayment is
  // dispatched the charge can complete server side, so an edit mid-confirm would remount
  // the keyed checkout and show a fresh form for a purchase that already went through. A
  // decline sets this back to false so the controls stay editable after a failed attempt.
  const [cardSubmitting, setCardSubmitting] = useState(false);
  // Whether this payment-step entry is for an UNPAID reservation (fresh create, refresh or
  // resume), which is what the grace-window notice is about. Deliberately not derived from
  // renewBaselineExpiryRef: that is also null for expired and suspended tenants, whose names
  // the sweep never reclaims (it only targets inactive rows with no payments), so telling a
  // renewing owner their name will be released would be false.
  const [isFreshReservation, setIsFreshReservation] = useState(false);
  // What we last reserved: the name AND the exact config sent. Going back and changing
  // anything (name, look, identity) must re-send createTenant before payment: the server
  // refreshes a same-owner unpaid reservation with the latest submission, so the look on
  // screen is the look that activates. A stale guard would either let the user pay for a
  // blog that was never created, or silently activate an older look.
  const createdForRef = useRef<{ name: string; payload: string } | null>(null);
  // Expiry of an ALREADY-ACTIVE tenant captured when entering the payment step (renewal).
  // "I've sent the payment" must then require the expiry to move FORWARD, otherwise a
  // renewing owner sees "your blog is live" without any payment having landed.
  const renewBaselineExpiryRef = useRef<string | null>(null);

  const baseDomain = "blogs.ecency.com";
  const isCommunity = instanceType === "community";
  // The tenant subdomain/name: the Hive user for a personal blog, the community id for a community.
  // The owner (payer/controller) is always the logged-in account.
  const tenantUsername = (isCommunity ? communityId : username).trim().toLowerCase();
  // Card can only activate the payer's own tenant: ePoints binds the Stripe order to the
  // authenticated buyer, and activation targets that account. A community is keyed by its id, not
  // by the buyer, so the on-chain HBD memo is the only rail that can target it. Keep card to a
  // personal blog owned by the buyer.
  // Card is available when the logged-in account is the payer: for a personal blog that must be the
  // blog account itself; for a community the owner (any logged-in account) pays and the community is
  // activated via hostingTarget, so it does not need to equal the tenant.
  const cardEnabled =
    !!methods?.card.enabled &&
    !!activeUser &&
    (isCommunity || tenantUsername === activeUser.username);

  // The custom-domain add-on is only offered to a logged-in OWNER of the tenant (their own personal
  // blog, or a community they own) — on either rail. This matches the condition that gates the
  // domain-setup UI on the success screen and in the manage panel, so the add-on is never sold to a
  // visitor (logged out, gifting, or paying for someone else's blog) who then can't attach or
  // verify the domain in-flow.
  const canManageDomain = !!activeUser && (isCommunity || tenantUsername === activeUser.username);

  // One-click HBD is only offered for Keychain (and Keychain-compatible extensions such as Keeper /
  // PeakVault, which all report loginType "keychain"): they sign the transfer in-page so the await
  // resolves here and we can poll for activation. HiveSigner and keychain-mobile redirect the whole
  // page for an active op, which would abandon this flow mid-send, so those fall back to manual.
  const canOneClickHive = !!activeUser && getLoginType(activeUser.username) === "keychain";

  useEffect(() => {
    hostingApi
      .paymentMethods()
      .then(setMethods)
      .catch(() => setMethods(null));
  }, []);

  // Default to HBD whenever card is not actually available to this visitor (logged out, or
  // the name is not their own), so the payment step never renders with no method shown.
  useEffect(() => {
    if (!cardEnabled) setMethod("hbd");
  }, [cardEnabled]);

  // Custom domain now works on BOTH rails: card ($3/mo) and HBD via a one-step
  // blog:name[:months]:domain memo (+1 HBD/mo). It no longer forces a rail, but it IS dropped when
  // the visitor can't own/manage the domain (logged out, or paying for a tenant that isn't theirs),
  // so a stale toggle can't sell an add-on that has no in-flow setup.
  useEffect(() => {
    if (!canManageDomain && customDomain) setCustomDomain(false);
  }, [canManageDomain, customDomain]);

  const goCustomize = () => {
    setError("");
    if (isCommunity) {
      // The owner (creator) must be logged in: the owner comes from the active account.
      if (!activeUser) {
        toggleUIProp("login");
        return;
      }
      if (!isValidCommunityId(communityId)) {
        setError(i18next.t("hosting.invalid-community-id"));
        return;
      }
    } else {
      const err = getUsernameError(tenantUsername);
      if (err) {
        setError(err);
        return;
      }
    }
    // Appearance choices belong to the name they were made for: a different name
    // starts from the defaults (its own draft, if any, repopulates below).
    if (customizeForRef.current && customizeForRef.current !== tenantUsername) {
      setStyleTemplate(null);
      setAccent(null);
      setAccentInput("");
      setFontPreset(null);
    }
    customizeForRef.current = tenantUsername;
    // The previous name's auto-prefilled identity must not ride into a different name's
    // tenant: take back exactly what the prefill planted, if the user has not edited it.
    // Computed locally so the draft restore below sees the cleared values, not the stale
    // state of this closure.
    let nextTitle = title;
    let nextDescription = description;
    const planted = plantedRef.current;
    if (planted && planted.name !== tenantUsername) {
      if (planted.title && nextTitle === planted.title) nextTitle = "";
      if (planted.description && nextDescription === planted.description) nextDescription = "";
      plantedRef.current = null;
    }
    // An abandoned tab resumes its customization for the same name.
    const draft = readCustomizeDraft(tenantUsername);
    if (draft) {
      if (draft.styleTemplate !== undefined) setStyleTemplate(draft.styleTemplate);
      if (draft.accent !== undefined) {
        setAccent(draft.accent);
        setAccentInput(draft.accent ?? "");
      }
      if (draft.fontPreset !== undefined) setFontPreset(draft.fontPreset);
      if (draft.title && !nextTitle) nextTitle = draft.title;
      if (draft.description && !nextDescription) nextDescription = draft.description;
    }
    setTitle(nextTitle);
    setDescription(nextDescription);
    setStep("customize");
  };

  // Template catalog, fetched once when the customize step is first shown. A failed
  // fetch must not block signup: the picker explains and the instance starts on the
  // default look. Optional call: an older service without the endpoint behaves like
  // a failed fetch.
  useEffect(() => {
    if (step !== "customize" || templates || templatesFailed) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => hostingApi.templates?.())
      .then((r) => {
        if (cancelled) return;
        // An empty catalog is a failure for the picker's purposes: an empty grid
        // with no explanation is worse than the plain-form fallback.
        if (r && Array.isArray(r.templates) && r.templates.length > 0) setTemplates(r.templates);
        else setTemplatesFailed(true);
      })
      .catch(() => {
        if (!cancelled) setTemplatesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [step, templates, templatesFailed]);

  // Prefill identity from the account's profile so the step starts with the owner's
  // own words instead of empty boxes. Only for a personal blog (a community's title
  // is resolved server-side from the community record), only into EMPTY fields, and
  // only once per name so typing is never fought.
  const { data: prefillAccount } = useQuery({
    ...getAccountFullQueryOptions(tenantUsername),
    enabled: step === "customize" && !isCommunity && tenantUsername.length >= 3
  });
  const prefilledForRef = useRef("");
  // Which name the current appearance state was composed for.
  const customizeForRef = useRef("");
  // What the prefill planted and for whom, so a NAME CHANGE can take it back out again:
  // without this, bob's signup would silently carry alice's profile title and bio because
  // the empty-field guard sees them as already filled.
  const plantedRef = useRef<{ name: string; title: string; description: string } | null>(null);
  useEffect(() => {
    if (step !== "customize" || isCommunity || !prefillAccount) return;
    if (prefilledForRef.current === tenantUsername) return;
    prefilledForRef.current = tenantUsername;
    const profile = (
      prefillAccount as { profile?: { name?: unknown; about?: unknown } } | undefined
    )?.profile;
    const plantedTitle = profile?.name && !title ? String(profile.name).slice(0, 100) : "";
    const plantedDescription =
      profile?.about && !description ? String(profile.about).slice(0, 500) : "";
    if (plantedTitle) setTitle(plantedTitle);
    if (plantedDescription) setDescription(plantedDescription);
    if (plantedTitle || plantedDescription) {
      plantedRef.current = {
        name: tenantUsername,
        title: plantedTitle,
        description: plantedDescription
      };
    }
  }, [step, isCommunity, prefillAccount, tenantUsername, title, description]);

  // Persist the in-progress customization per name.
  useEffect(() => {
    if (step !== "customize" || !tenantUsername) return;
    try {
      localStorage.setItem(
        customizeDraftKey(tenantUsername),
        JSON.stringify({
          styleTemplate,
          accent,
          fontPreset,
          title,
          description,
          savedAt: Date.now()
        })
      );
    } catch {}
  }, [step, tenantUsername, styleTemplate, accent, fontPreset, title, description]);

  const accentPending =
    accentInput.trim().length > 0 && !ACCENT_HEX_PATTERN.test(accentInput.trim());

  const {
    download: downloadSelfHostBundle,
    busy: bundleBusy,
    error: bundleError
  } = useDownloadSelfHostBundle();

  /**
   * The self-host branch. It composes the same document the managed path
   * would create a tenant from, wraps it with the deployment files and hands
   * the archive over. It calls NOTHING that reserves a name: no createTenant,
   * and createdForRef is deliberately left alone, so switching back to
   * managed afterwards still makes the reservation properly.
   */
  const downloadBundle = useCallback(async () => {
    await downloadSelfHostBundle({
      username: tenantUsername,
      // A community is shown by the site but owned by the signed-in account.
      owner: isCommunity ? (activeUser?.username ?? undefined) : undefined,
      domain: selfHostDomain.trim() || undefined,
      config: {
        theme: "system",
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        styleTemplate: styleTemplate ?? undefined,
        accent: accent ?? undefined,
        fontPreset: fontPreset ?? undefined,
        ...(isCommunity ? { type: "community" as const, communityId: tenantUsername } : {})
      }
    });
  }, [
    downloadSelfHostBundle,
    tenantUsername,
    isCommunity,
    activeUser,
    selfHostDomain,
    title,
    description,
    styleTemplate,
    accent,
    fontPreset
  ]);

  // Create the (inactive) tenant for the CURRENT username, then move to payment. Payment
  // activates it. Re-creates when the username changed since the last creation.
  const goPayment = useCallback(async () => {
    setError("");
    setBusy(true);
    const uname = tenantUsername;
    // A community is owned and paid for by the logged-in account; a personal blog is owned by the
    // blog account itself (which may pay by HBD while logged out).
    const owner = isCommunity ? (activeUser?.username ?? "") : uname;
    try {
      const config = {
        theme: "system" as const,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        styleTemplate: styleTemplate ?? undefined,
        accent: accent ?? undefined,
        fontPreset: fontPreset ?? undefined,
        ...(isCommunity ? { type: "community" as const, communityId: uname } : {})
      };
      const payload = JSON.stringify({ owner, config });
      if (createdForRef.current?.name !== uname || createdForRef.current?.payload !== payload) {
        const res = await hostingApi.createTenant(uname, owner, config);
        createdForRef.current = { name: uname, payload };
        setBlogUrl(res.tenant.blogUrl);
        renewBaselineExpiryRef.current = null; // freshly created, inactive
      }
      setIsFreshReservation(true);
      setStep("payment");
    } catch (e) {
      const msg = (e as Error).message;
      if (msg !== "Username already registered") {
        setError(msg);
        return;
      }
      // The tenant already existing is not an error: only its OWNER may resume to payment or
      // renew. Establishing the renewal baseline (the current expiry) requires reading the
      // tenant, so if that read fails we must NOT proceed — otherwise checkActivation would
      // treat this renewal as a first activation and could confirm success without the expiry
      // moving. Surface a retry instead. (For a personal blog the owner is the account itself;
      // for a community the owner is confirmed against the fetched record.)
      if (!activeUser) {
        setError(i18next.t("hosting.already-registered"));
        return;
      }
      let existing: Awaited<ReturnType<typeof hostingApi.tenant>>;
      try {
        existing = await hostingApi.tenant(uname);
      } catch {
        setError(i18next.t("hosting.status-check-failed"));
        return;
      }
      const isOwner = isCommunity
        ? existing.owner === activeUser.username
        : activeUser.username === uname;
      if (!isOwner) {
        setError(i18next.t("hosting.already-registered"));
        return;
      }
      // A 409 now only means an active/expired tenant (renewal) or someone else's
      // reservation; unpaid same-owner reservations are refreshed above. Record the name
      // with no payload so a later look change still attempts a fresh create.
      createdForRef.current = { name: uname, payload: "" };
      setBlogUrl(`https://${uname}.${baseDomain}`);
      // Renewal of an already-active tenant: remember the current expiry so activation is only
      // confirmed once it advances. null (an inactive tenant resuming its first payment) means
      // checkActivation confirms on active status alone.
      renewBaselineExpiryRef.current =
        existing.subscriptionStatus === "active" ? (existing.subscriptionExpiresAt ?? null) : null;
      setIsFreshReservation(false);
      setStep("payment");
    } finally {
      setBusy(false);
    }
  }, [
    tenantUsername,
    isCommunity,
    title,
    description,
    styleTemplate,
    accent,
    fontPreset,
    activeUser
  ]);

  // Mint a one-time handoff CODE as soon as the success screen shows: the
  // Customize link used to carry the session bearer itself in its fragment,
  // which left a captured link a live credential until upstream expiry. The
  // hosting API now stores the ensureValidToken-resolved token behind a code
  // that dies on first exchange or in five minutes, so the URL artifact is
  // worthless afterwards. Re-minted on an interval while the screen stays
  // open (codes outlive nobody's coffee break); a failed mint leaves the
  // click on the credential-free fallback href.
  const [handoff, setHandoff] = useState<{ code: string; expiresAt: number } | null>(null);
  // Bumped by a click: the opened code is consumed by the instance, so the
  // click clears it and this forces a fresh mint for any further click.
  const [mintNonce, setMintNonce] = useState(0);
  useEffect(() => {
    // Whatever code exists belongs to the PREVIOUS context (another account,
    // a logout, an earlier screen) and must never ride the button into this
    // one: cleared before anything else, minted fresh below if eligible.
    setHandoff(null);
    if (step !== "success" || !activeUser) return;
    let cancelled = false;
    const mint = async () => {
      try {
        const token = await ensureValidToken(activeUser.username);
        if (!token || cancelled) return;
        const minted = await hostingApi.mintHandoff(token);
        if (!cancelled) {
          setHandoff({
            code: minted.code,
            // The server's word on the TTL; an unparseable answer counts as
            // already stale rather than forever fresh.
            expiresAt: Date.parse(minted.expiresAt) || 0
          });
        }
      } catch {
        if (!cancelled) setHandoff(null);
      }
    };
    mint();
    const timer = setInterval(mint, 4 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [step, activeUser, mintNonce]);

  // The reservation is made and paid for; the in-progress draft has served its purpose.
  useEffect(() => {
    if (step !== "success" || !tenantUsername) return;
    // Guarded on the reservation this flow actually made or resumed: a pending
    // payment recovered for a DIFFERENT tenant must not delete this name's draft.
    if (createdForRef.current?.name !== tenantUsername) return;
    try {
      localStorage.removeItem(customizeDraftKey(tenantUsername));
    } catch {}
  }, [step, tenantUsername]);

  // Deep-link from the "Your hosted sites" manage panel: ?resume=<username>[&type=community] jumps
  // straight to the payment step for an existing reservation, so an "Awaiting payment" tenant has a
  // one-click way to finalize instead of dead-ending on the status label. Sets the form state from
  // the params, then advances via goPayment (which resumes an existing owned tenant to payment)
  // once that state has propagated.
  const [resumeName, setResumeName] = useState<string | null>(null);
  const activeUsername = activeUser?.username;
  useEffect(() => {
    if (typeof window === "undefined" || !activeUsername) return;
    const resume = new URLSearchParams(window.location.search).get("resume")?.trim().toLowerCase();
    if (!resume) return;
    // Consume the param immediately so a refresh/remount after activation can't replay the flow
    // (which, since goPayment lets an active owned tenant through as a renewal, would otherwise
    // send them back to payment for an accidental extra term).
    window.history.replaceState(null, "", window.location.pathname);
    let cancelled = false;
    (async () => {
      let owned;
      try {
        owned = (await hostingApi.tenantsByOwner(activeUsername)).tenants;
      } catch {
        return;
      }
      if (cancelled) return;
      // Only resume a reservation the current account actually OWNS and that is still awaiting
      // payment, and take the instance type from the record (not the URL) — a crafted or incomplete
      // resume URL must not create a new, or wrong-typed, reservation via goPayment's createTenant.
      const t = owned.find((x) => x.username.toLowerCase() === resume);
      if (!t || t.subscriptionStatus !== "inactive") return;
      const isComm = t.type === "community";
      setInstanceType(isComm ? "community" : "blog");
      if (isComm) setCommunityId(t.username);
      else setUsername(t.username);
      // Straight to payment WITHOUT createTenant: the reservation exists and its
      // saved customization must survive a resume click. The sentinel payload can
      // never equal a composed one, so going Back and actively re-customizing
      // still re-sends creation, which is the one flow that should refresh it.
      createdForRef.current = { name: t.username.toLowerCase(), payload: "\u0000resume" };
      setBlogUrl(t.blogUrl || `https://${t.username.toLowerCase()}.${baseDomain}`);
      renewBaselineExpiryRef.current = null; // inactive: first payment, not a renewal
      setResumeName(t.username.toLowerCase());
    })();
    return () => {
      cancelled = true;
    };
  }, [activeUsername]);
  useEffect(() => {
    if (resumeName && step === "username" && tenantUsername === resumeName && activeUser) {
      setResumeName(null);
      setIsFreshReservation(true);
      setStep("payment");
    }
  }, [resumeName, step, tenantUsername, activeUser]);

  // Deep-link from an unclaimed *.blogs.ecency.com subdomain's claim landing: ?claim=<name>
  // prefills the form so the visitor arrives ready to reserve that exact name. A hive-<digits>
  // name preselects a community, anything else an author blog. Prefill only, no auto-advance: the
  // visitor still reviews the plan and pays, and the usual validation applies. Runs once and
  // consumes the param so a refresh doesn't re-apply it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const claim = params.get("claim")?.trim().toLowerCase();
    if (!claim) return;
    // Consume ONLY the claim param, preserving any others (e.g. resume) so the resume effect,
    // which reads window.location.search after auth state is available, still sees them.
    params.delete("claim");
    const qs = params.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    if (/^hive-\d+$/.test(claim)) {
      setInstanceType("community");
      setCommunityId(claim);
    } else {
      setInstanceType("blog");
      setUsername(claim);
    }
  }, []);

  // HBD: refresh instructions for the selected term (and custom-domain add-on). Guard against a
  // slow earlier response (a different term/tier) landing after a newer one and showing a
  // mismatched amount/memo. With the add-on the endpoint returns the higher price and a ':domain'
  // memo, so the on-chain rail activates the custom-domain tier in one transfer.
  useEffect(() => {
    if (step !== "payment" || method !== "hbd") return;
    let stale = false;
    // Clear immediately so the previous term's amount/memo isn't copyable while the new one loads.
    setInstructions(null);
    hostingApi
      .paymentInstructions(tenantUsername, months, customDomain)
      .then((r) => {
        if (!stale) setInstructions({ to: r.to, amount: r.amount, memo: r.memo });
      })
      .catch(() => {
        if (!stale) setInstructions(null);
      });
    return () => {
      stale = true;
    };
  }, [step, method, months, tenantUsername, customDomain]);

  // A tenant read counts as "paid + live" only when it is active AND, for a renewal (a tenant that
  // was already active when we entered payment), its expiry has moved FORWARD past the captured
  // baseline — otherwise "active" is trivially true and would confirm success with no payment.
  const isActivated = useCallback((t: Awaited<ReturnType<typeof hostingApi.tenant>>) => {
    const baseline = renewBaselineExpiryRef.current;
    const advanced =
      !baseline ||
      (!!t.subscriptionExpiresAt &&
        new Date(t.subscriptionExpiresAt).getTime() > new Date(baseline).getTime());
    return t.subscriptionStatus === "active" && advanced;
  }, []);

  const checkActivation = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      const t = await hostingApi.tenant(tenantUsername);
      if (isActivated(t)) {
        setStep("success");
      } else {
        setError(i18next.t("hosting.not-yet-active"));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [tenantUsername, isActivated]);

  // After an on-chain transfer is broadcast, poll the tenant until the payment listener replays
  // the block and activates it (usually a few seconds). Returns true once active. Never throws —
  // a failed read just retries — so a caller can distinguish "broadcast ok but not confirmed yet"
  // from a broadcast error.
  const pollActivation = useCallback(async () => {
    for (let i = 0; i < 15; i++) {
      try {
        const t = await hostingApi.tenant(tenantUsername);
        if (isActivated(t)) return true;
      } catch {
        // transient read error — keep polling
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    return false;
  }, [tenantUsername, isActivated]);

  // One-click HBD: broadcast the exact transfer (to/amount/memo from the instructions) through the
  // logged-in account's own auth (Keychain / HiveSigner / HiveAuth / key), then poll for activation.
  // This removes the "copy memo, pay elsewhere, click I've paid" round trip that leaves dormant
  // unpaid records. The manual instructions remain as a fallback (logged-out payers, other wallets).
  const transfer = useTransferMutation();
  const payWithHive = useCallback(async () => {
    if (!instructions) return;
    setError("");
    setBusy(true);
    setPaying(true);
    // Persist a resume marker BEFORE broadcasting. If the signer redirects the whole page (e.g. a
    // Keychain user who cancels and picks HiveSigner in the active-authority upgrade dialog), the
    // page reloads on return with component state reset — the mount effect below reads this and
    // resumes polling instead of losing the pending payment or offering the button again.
    try {
      sessionStorage.setItem(
        PENDING_HBD_KEY,
        JSON.stringify({
          tenant: tenantUsername,
          blogUrl,
          baseline: renewBaselineExpiryRef.current
        })
      );
    } catch {}
    try {
      await transfer.mutateAsync({
        to: instructions.to,
        amount: instructions.amount,
        memo: instructions.memo
      });
      if (await pollActivation()) {
        clearPendingHbd();
        setStep("success");
      } else {
        // Broadcast landed but activation hasn't been observed yet. Keep `paying` true so the
        // one-click button stays disabled — the transfer may already be on-chain and re-clicking
        // would send a DUPLICATE with the same memo. Funnel to the manual re-check instead, and
        // keep the marker so a reload/redirect-return also resumes.
        setError(i18next.t("hosting.pay-hbd-pending-recheck"));
      }
    } catch (e) {
      // Wallet prompt cancelled or broadcast failed — no payment was sent, so drop the marker and
      // re-enable the button for a retry / manual payment.
      clearPendingHbd();
      setPaying(false);
      setError((e as Error)?.message || i18next.t("hosting.pay-failed"));
    } finally {
      setBusy(false);
    }
  }, [instructions, transfer, pollActivation, tenantUsername, blogUrl]);

  // Resume a one-click HBD payment that a redirecting signer (or a page reload) left pending: poll
  // the tenant and jump to success once it activates. Runs once on mount and is non-destructive to
  // a fresh signup — it only advances to success when the pending tenant is genuinely active.
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(PENDING_HBD_KEY);
    } catch {}
    if (!raw) return;
    let pending: { tenant?: string; blogUrl?: string; baseline?: string | null };
    try {
      pending = JSON.parse(raw);
    } catch {
      clearPendingHbd();
      return;
    }
    if (!pending?.tenant) {
      clearPendingHbd();
      return;
    }
    const tenant = pending.tenant;
    const baseline = pending.baseline ?? null;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < 15 && !cancelled; i++) {
        try {
          const t = await hostingApi.tenant(tenant);
          const advanced =
            !baseline ||
            (!!t.subscriptionExpiresAt &&
              new Date(t.subscriptionExpiresAt).getTime() > new Date(baseline).getTime());
          if (t.subscriptionStatus === "active" && advanced) {
            if (!cancelled) {
              setBlogUrl(pending.blogUrl || `https://${tenant}.${baseDomain}`);
              clearPendingHbd();
              setStep("success");
            }
            return;
          }
        } catch {
          // transient read error — keep polling
        }
        await new Promise((r) => setTimeout(r, 3000));
      }
      // Not confirmed within the window: stop auto-resuming. If the payment landed, the tenant will
      // still activate and the "Your hosted sites" panel on this page surfaces it.
      if (!cancelled) clearPendingHbd();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usdPerBase = (methods?.card.monthlyUsdCents ?? 200) / 100;
  const hbdPerBase = parseFloat(methods?.hbd.monthly ?? "2");
  // Custom domain is +$1/mo on top of hosting -> $3/mo total (and +1 HBD/mo for parity).
  const usdPer = customDomain ? HOSTING_CUSTOM_DOMAIN_MONTHLY_USD : usdPerBase;
  const hbdPer = customDomain ? hbdPerBase + 1 : hbdPerBase;
  const cardSku = customDomain ? hostingProSkuForMonths(months) : hostingSkuForMonths(months);
  // The payment-step selection controls are locked while a card submit is in flight
  // (cardSubmitting) and stay locked once the payment is confirmed (paying).
  const payLocked = paying || cardSubmitting;

  // Only surface a well-formed https URL as a link so a validated subdomain or API-returned blog URL
  // cannot carry an unexpected scheme into the href (guards CodeQL js/xss-through-dom).
  let safeBlogUrl = "";
  try {
    if (blogUrl) {
      const parsed = new URL(blogUrl);
      if (parsed.protocol === "https:") safeBlogUrl = parsed.toString();
    }
  } catch {
    safeBlogUrl = "";
  }

  // Manual HBD instructions (send-to / amount / memo), shared by the logged-out flow and the
  // "pay manually" fallback under the one-click button.
  const hbdManualInstructions = (
    <>
      <p>{i18next.t("hosting.hbd-instructions")}</p>
      {instructions && (
        <div className="rounded-lg border border-[--border-color] p-3 flex flex-col gap-1 font-mono">
          <div>
            {i18next.t("hosting.send-to")}: @{instructions.to}
          </div>
          <div>
            {i18next.t("hosting.amount")}: {instructions.amount}
          </div>
          <div>
            {i18next.t("hosting.memo")}: {instructions.memo}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{i18next.t("hosting.title")}</h1>
      <p className="opacity-75">{i18next.t("hosting.subtitle")}</p>
      <p className="text-sm">
        <Link href="/perks" className="text-blue-dark-sky hover:underline">
          {i18next.t("hosting.free-with-pro")}
        </Link>
      </p>

      {error && <Alert appearance="danger">{error}</Alert>}

      {step === "username" && (
        <div className="flex flex-col gap-3">
          {/* Instance type: personal blog (default) or a Hive community as its own site. */}
          <div className="flex gap-2">
            <button
              onClick={() => setInstanceType("blog")}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                !isCommunity
                  ? "border-blue-dark-sky bg-blue-dark-sky/10"
                  : "border-[--border-color]"
              }`}
            >
              {i18next.t("hosting.type-blog")}
            </button>
            <button
              onClick={() => setInstanceType("community")}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                isCommunity ? "border-blue-dark-sky bg-blue-dark-sky/10" : "border-[--border-color]"
              }`}
            >
              {i18next.t("hosting.type-community")}
            </button>
          </div>

          {isCommunity ? (
            <>
              <label className="text-sm font-semibold">
                {i18next.t("hosting.community-id-label")}
              </label>
              <FormControl
                type="text"
                value={communityId}
                onChange={(e: any) => setCommunityId(e.target.value)}
                placeholder="hive-125125"
                autoFocus={true}
              />
              <p className="text-sm opacity-75">{i18next.t("hosting.community-explainer")}</p>
              <p className="text-sm opacity-60">
                {i18next.t("hosting.subdomain-preview", {
                  url: `${communityId.trim().toLowerCase() || "hive-125125"}.${baseDomain}`
                })}
              </p>
              {!activeUser && (
                <Alert appearance="primary">{i18next.t("hosting.community-login-required")}</Alert>
              )}
            </>
          ) : (
            <>
              <label className="text-sm font-semibold">{i18next.t("hosting.username-label")}</label>
              <FormControl
                type="text"
                value={username}
                onChange={(e: any) => setUsername(e.target.value)}
                placeholder="yourname"
                autoFocus={true}
              />
              <p className="text-sm opacity-60">
                {i18next.t("hosting.subdomain-preview", {
                  url: `${username || "yourname"}.${baseDomain}`
                })}
              </p>
            </>
          )}
          <Button onClick={goCustomize} full={true}>
            {i18next.t("g.continue")}
          </Button>
        </div>
      )}

      {step === "customize" && (
        <div className="flex flex-col gap-3">
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

          <label className="text-sm font-semibold">
            {i18next.t(isCommunity ? "hosting.community-title-label" : "hosting.blog-title-label")}
          </label>
          <FormControl
            type="text"
            value={title}
            onChange={(e: any) => setTitle(e.target.value)}
            placeholder={i18next.t(
              isCommunity ? "hosting.community-title-placeholder" : "hosting.blog-title-placeholder"
            )}
          />
          <label className="text-sm font-semibold">{i18next.t("hosting.blog-desc-label")}</label>
          <FormControl
            type="text"
            value={description}
            onChange={(e: any) => setDescription(e.target.value)}
            placeholder={i18next.t(
              isCommunity ? "hosting.community-desc-placeholder" : "hosting.blog-desc-placeholder"
            )}
          />

          <p className="text-sm opacity-60">{i18next.t("hosting.changeable-later")}</p>

          <label className="text-sm font-semibold">{i18next.t("hosting.destination-label")}</label>
          <DestinationPicker
            value={destination}
            onChange={setDestination}
            domain={selfHostDomain}
            onDomainChange={setSelfHostDomain}
            disabled={busy || bundleBusy}
          />
          {bundleError && <div className="text-sm text-red">{bundleError}</div>}

          <div className="flex gap-2">
            <Button appearance="secondary" onClick={() => setStep("username")}>
              {i18next.t("g.back")}
            </Button>
            {destination === "self-host" ? (
              <Button
                onClick={downloadBundle}
                disabled={bundleBusy || accentPending}
                isLoading={bundleBusy}
                full={true}
              >
                {i18next.t("hosting.download-bundle")}
              </Button>
            ) : (
              <Button
                onClick={goPayment}
                disabled={busy || accentPending}
                isLoading={busy}
                full={true}
              >
                {i18next.t("g.continue")}
              </Button>
            )}
          </div>
        </div>
      )}

      {step === "payment" && (
        <div className="flex flex-col gap-4">
          {/* A fresh reservation is held with its customized look for a limited window; say so
              plainly (pay to keep it). Renewals (an expiry baseline exists) are not reservations
              and skip the line. The window comes from the API so this number cannot drift from
              the sweep's configuration. */}
          {isFreshReservation && !!methods?.reservation?.graceDays && (
            <p className="text-sm opacity-75">
              {i18next.t("hosting.reservation-grace", { count: methods.reservation.graceDays })}
            </p>
          )}
          {/* Term */}
          <div className="flex gap-2 flex-wrap">
            {TERMS.map((m) => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                disabled={payLocked}
                className={`px-3 py-2 rounded-lg border text-sm ${
                  months === m
                    ? "border-blue-dark-sky bg-blue-dark-sky/10"
                    : "border-[--border-color]"
                } ${payLocked ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {i18next.t("hosting.term-months", { n: m })}
              </button>
            ))}
          </div>

          {/* Custom domain add-on, for both instance types and both rails: card ($3/mo) or the
              one-step HBD ':domain' memo (+1 HBD/mo). Offered only to a logged-in owner (either
              rail) so the buyer can actually attach + verify the domain after checkout. */}
          {methods && canManageDomain && (
            <button
              onClick={() => setCustomDomain((v) => !v)}
              disabled={payLocked}
              className={`text-left px-4 py-3 rounded-lg border ${
                customDomain
                  ? "border-blue-dark-sky bg-blue-dark-sky/10"
                  : "border-[--border-color]"
              } ${payLocked ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{i18next.t("hosting.custom-domain-option")}</span>
                <span className="text-sm text-blue-dark-sky">
                  {customDomain
                    ? i18next.t("hosting.custom-domain-added")
                    : i18next.t("hosting.custom-domain-price")}
                </span>
              </div>
              <p className="text-sm opacity-75 mt-1">
                {i18next.t("hosting.custom-domain-explainer")}
              </p>
            </button>
          )}

          {/* Method toggle */}
          <div className="flex gap-2">
            {cardEnabled && (
              <button
                onClick={() => setMethod("card")}
                disabled={payLocked}
                className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                  method === "card"
                    ? "border-blue-dark-sky bg-blue-dark-sky/10"
                    : "border-[--border-color]"
                } ${payLocked ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                {i18next.t("hosting.pay-card", { amount: (usdPer * months).toFixed(2) })}
              </button>
            )}
            <button
              onClick={() => setMethod("hbd")}
              disabled={payLocked}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                method === "hbd"
                  ? "border-blue-dark-sky bg-blue-dark-sky/10"
                  : "border-[--border-color]"
              } ${payLocked ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {i18next.t("hosting.pay-hbd", { amount: (hbdPer * months).toFixed(3) })}
            </button>
          </div>

          {customDomain && (
            <p className="text-sm opacity-75">{i18next.t("hosting.custom-domain-included-note")}</p>
          )}

          {method === "card" && cardEnabled && (
            <HostingCardCheckout
              key={`${cardSku}:${tenantUsername}:${activeUser?.username ?? ""}`}
              username={activeUser?.username ?? tenantUsername}
              hostingTarget={isCommunity ? tenantUsername : undefined}
              sku={cardSku}
              payLabel={i18next.t("hosting.pay-now")}
              returnUrl={typeof window !== "undefined" ? window.location.href : ""}
              onConfirmed={() => setPaying(true)}
              onSubmittingChange={setCardSubmitting}
              onActivated={() => setStep("success")}
            />
          )}

          {method === "hbd" && (
            <div className="flex flex-col gap-3 text-sm">
              {canOneClickHive ? (
                <>
                  <Button
                    onClick={payWithHive}
                    disabled={busy || !instructions || paying}
                    isLoading={busy}
                    full={true}
                  >
                    {i18next.t("hosting.pay-hbd-oneclick", {
                      amount: (hbdPer * months).toFixed(3)
                    })}
                  </Button>
                  {/* While sending, reassure; once a transfer is out but not yet confirmed, `paying`
                      stays true (button disabled to prevent a duplicate send) and we funnel to the
                      manual re-check via the auto-opened section below. */}
                  {busy && paying && (
                    <p className="opacity-75">{i18next.t("hosting.pay-hbd-sending")}</p>
                  )}
                  {/* Fallback: another wallet, paying from a different account (e.g. a gift), or the
                      manual re-check after a broadcast that hasn't been confirmed yet (auto-opened). */}
                  <details open={paying} className="rounded-lg border border-[--border-color] p-3">
                    <summary className="cursor-pointer select-none">
                      {i18next.t("hosting.pay-hbd-manual")}
                    </summary>
                    <div className="flex flex-col gap-2 mt-3">
                      {hbdManualInstructions}
                      <Button
                        appearance="secondary"
                        onClick={checkActivation}
                        disabled={busy}
                        isLoading={busy}
                        full={true}
                      >
                        {i18next.t("hosting.ive-paid")}
                      </Button>
                    </div>
                  </details>
                </>
              ) : (
                <>
                  {hbdManualInstructions}
                  <Button onClick={checkActivation} disabled={busy} isLoading={busy} full={true}>
                    {i18next.t("hosting.ive-paid")}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {step === "success" && (
        <div className="flex flex-col gap-4">
          <Alert appearance="success">
            <div className="flex flex-col gap-2">
              <strong>{i18next.t("hosting.success-title")}</strong>
              {safeBlogUrl && (
                <a
                  href={safeBlogUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-dark-sky underline"
                >
                  {safeBlogUrl}
                </a>
              )}
            </div>
          </Alert>

          {/* Land the owner on their new site signed in, with the settings panel
              opening by itself. Every ecency.com login method holds a
              Hivesigner-compatible access token, so the session carries over as a
              URL FRAGMENT (never a query param: fragments reach no server or log).
              The instance resolves identity from Hivesigner /me by the token
              itself, accepts only the instance owner's session, and scrubs the
              fragment before rendering. The token is attached at CLICK time and
              never sits in the DOM: an href holding a bearer is one right-click
              "Copy link address" away from being pasted somewhere public. The
              at-rest href is the safe fallback — the instance-side OAuth start
              for Hivesigner sessions, or a plain setup intent that opens the
              panel after a manual login — and is what a middle-click gets. */}
          {safeBlogUrl && (
            <a
              href={`${safeBlogUrl}?setup=1${
                activeUser && getLoginType(activeUser.username) === "hivesigner"
                  ? "&login=hivesigner"
                  : ""
              }`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => {
                // Synchronous within the gesture, so popup blockers allow the
                // open. Only the minted one-time code travels in the URL,
                // never the bearer; without a code the default navigation
                // takes the fallback href. The opened URL keeps the OAuth
                // fallback param, so a code the instance cannot exchange
                // still lands a Hivesigner owner in a login flow. The click
                // consumes the code (the instance's exchange deletes it), so
                // it is cleared here and a fresh one is minted for any
                // further click.
                if (!handoff) return;
                // A code past (or within thirty seconds of) its server TTL
                // would exchange as dead: take the fallback navigation and
                // mint a replacement instead of opening it.
                if (handoff.expiresAt - 30_000 < Date.now()) {
                  setHandoff(null);
                  setMintNonce((n) => n + 1);
                  return;
                }
                e.preventDefault();
                const loginParam =
                  activeUser && getLoginType(activeUser.username) === "hivesigner"
                    ? "&login=hivesigner"
                    : "";
                window.open(
                  `${safeBlogUrl}?setup=1${loginParam}#hc=${encodeURIComponent(handoff.code)}`,
                  "_blank",
                  "noopener,noreferrer"
                );
                setHandoff(null);
                setMintNonce((n) => n + 1);
              }}
              className="inline-block text-center px-4 py-3 rounded-lg bg-blue-dark-sky text-white font-semibold hover:opacity-90"
            >
              {i18next.t("hosting.customize-your-blog")}
            </a>
          )}

          {/* The site starts on a default template; without these steps owners don't discover
              that they can sign in on their new site and configure it (settings button). */}
          <div className="rounded-lg border border-[--border-color] p-4 flex flex-col gap-2">
            <div className="font-semibold">{i18next.t("hosting.next-steps-title")}</div>
            <ol className="list-decimal list-inside text-sm flex flex-col gap-1.5">
              <li>
                {i18next.t("hosting.next-step-login", {
                  owner: isCommunity ? (activeUser?.username ?? "") : tenantUsername
                })}
              </li>
              <li>{i18next.t("hosting.next-step-configure")}</li>
              <li>{i18next.t("hosting.next-step-renew")}</li>
            </ol>
          </div>

          {/* Custom domain plan -> let the owner attach and verify their domain now. For a
              community the tenant is the community id while the logged-in owner authorizes.
              Compare the normalized tenantUsername (not the raw field) so "Alice"/"alice "
              still shows the manager for tenant "alice". */}
          {customDomain &&
            activeUser &&
            (isCommunity || tenantUsername === activeUser.username) && (
              <CustomDomainManager
                username={activeUser.username}
                tenant={isCommunity ? tenantUsername : undefined}
              />
            )}
        </div>
      )}
    </div>
  );
}

export default HostingSignup;
