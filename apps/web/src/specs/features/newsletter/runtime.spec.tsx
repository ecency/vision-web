import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewsletterGate, NewsletterRuntimeProvider, useNewsletterEnabled } from "@/features/newsletter/runtime";

const flags = vi.hoisted(() => ({ newsletter: true }));
vi.mock("@/config", () => ({
  EcencyConfigManager: {
    getConfigValue: (fn: (c: unknown) => unknown) => fn({ visionFeatures: { newsletter: { enabled: flags.newsletter } } })
  }
}));

function Probe() {
  return <span data-testid="probe">{useNewsletterEnabled() ? "on" : "off"}</span>;
}

/**
 * vision-web#1522 review: one image serves every region, so whether the newsletter
 * controls show must follow the deployment's runtime configuration, not a build flag.
 * The client learns it from the provider; the provider is fed by the server.
 */
describe("newsletter runtime gate", () => {
  afterEach(() => {
    flags.newsletter = true;
  });

  it("is off outside the provider: an unwrapped tree never offers controls whose routes would 503", () => {
    render(
      <>
        <Probe />
        <NewsletterGate>
          <b>gated</b>
        </NewsletterGate>
      </>
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("off");
    expect(screen.queryByText("gated")).toBeNull();
  });

  it("follows the provider: configured shows, unconfigured hides", () => {
    const { unmount } = render(
      <NewsletterRuntimeProvider configured={false}>
        <Probe />
        <NewsletterGate>
          <b>gated</b>
        </NewsletterGate>
      </NewsletterRuntimeProvider>
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("off");
    expect(screen.queryByText("gated")).toBeNull();
    unmount();

    render(
      <NewsletterRuntimeProvider configured>
        <Probe />
        <NewsletterGate>
          <b>gated</b>
        </NewsletterGate>
      </NewsletterRuntimeProvider>
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("on");
    expect(screen.getByText("gated")).toBeInTheDocument();
  });

  it("the config kill switch still wins on a configured deploy", () => {
    flags.newsletter = false;
    render(
      <NewsletterRuntimeProvider configured>
        <Probe />
      </NewsletterRuntimeProvider>
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("off");
  });
});
