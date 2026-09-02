import "@testing-library/jest-dom";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useGlobalStore } from "@/core/global-store";
import { NewsletterRuntimeProvider } from "@/features/newsletter/runtime";
import { AnonFollowTagDialog } from "@/features/shared/follow-tag-btn/anon-follow-tag-dialog";
import {
  cleanupModalContainers,
  renderWithQueryClient,
  setupModalContainers
} from "@/specs/test-utils";

vi.mock("@/core/hooks/use-active-account", () => ({ useActiveAccount: vi.fn() }));
vi.mock("@/core/global-store", () => ({ useGlobalStore: vi.fn() }));

// The digest dialog mounts the Turnstile widget, which appends a script jsdom
// never runs; the mock renders nothing.
vi.mock("@/features/shared/turnstile", () => ({
  TURNSTILE_SITEKEY: "test-sitekey",
  Turnstile: () => null
}));

const flags = vi.hoisted(() => ({ newsletter: true }));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    getConfigValue: (fn: (c: unknown) => unknown) =>
      fn({ visionFeatures: { newsletter: { enabled: flags.newsletter } } })
  }
}));

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<object>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token"),
  ensureValidToken: vi.fn(async () => "mock-token")
}));

const toggleUiProp = vi.fn();

/** Renders inside a "service configured" runtime, as app/providers.tsx does on a configured deploy. */
function renderConfigured(ui: ReactElement) {
  return renderWithQueryClient(
    <NewsletterRuntimeProvider configured>{ui}</NewsletterRuntimeProvider>
  );
}

describe("AnonFollowTagDialog", () => {
  beforeEach(() => {
    setupModalContainers();
    vi.clearAllMocks();
    flags.newsletter = true;
    vi.mocked(useActiveAccount).mockReturnValue({ activeUser: null } as never);
    vi.mocked(useGlobalStore).mockImplementation((selector: (s: unknown) => unknown) =>
      selector({ toggleUiProp })
    );
  });
  afterEach(() => cleanupModalContainers());

  it("offers to log in, closing itself and opening the login modal", () => {
    const onHide = vi.fn();
    renderConfigured(<AnonFollowTagDialog tag="photography" show={true} onHide={onHide} />);

    expect(screen.getByText("follow-tag.anon-title")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "follow-tag.anon-login" }));

    expect(onHide).toHaveBeenCalledTimes(1);
    expect(toggleUiProp).toHaveBeenCalledWith("login");
  });

  // The email choice hands over to the tag digest dialog: the same one the tag
  // page uses, with the tag's own copy, and this dialog steps aside.
  it("offers the tag's email digest when the newsletter is on, handing over to the digest dialog", async () => {
    const onHide = vi.fn();
    renderConfigured(<AnonFollowTagDialog tag="photography" show={true} onHide={onHide} />);

    fireEvent.click(screen.getByRole("button", { name: "newsletter.button-tag" }));

    await waitFor(() => expect(screen.getByText("newsletter.tag-digest")).toBeInTheDocument());
    expect(screen.getByText("newsletter.intro-tag")).toBeInTheDocument();
    expect(screen.queryByText("follow-tag.anon-title")).not.toBeInTheDocument();
    expect(onHide).not.toHaveBeenCalled();
  });

  // With the newsletter off (or the service not configured) the only thing a
  // signed-out reader can do is log in, so the email choice is not shown.
  it("shows no email choice when the newsletter is off or the service is not configured", () => {
    flags.newsletter = false;
    const { unmount } = renderConfigured(
      <AnonFollowTagDialog tag="photography" show={true} onHide={vi.fn()} />
    );
    expect(screen.getByRole("button", { name: "follow-tag.anon-login" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "newsletter.button-tag" })).not.toBeInTheDocument();
    unmount();

    flags.newsletter = true;
    renderWithQueryClient(<AnonFollowTagDialog tag="photography" show={true} onHide={vi.fn()} />);
    expect(screen.getByRole("button", { name: "follow-tag.anon-login" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "newsletter.button-tag" })).not.toBeInTheDocument();
  });
});
