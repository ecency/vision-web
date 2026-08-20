import "@testing-library/jest-dom";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global store
const mockToggleUiProp = vi.fn();
let mockTheme = "day";
vi.mock("@/core/global-store", () => ({
  useGlobalStore: vi.fn((selector: any) => {
    const state = {
      theme: mockTheme,
      toggleUiProp: mockToggleUiProp
    };
    return selector(state);
  })
}));

// The rest of this file relies on the real SDK (the global setup mock is narrower),
// so keep the passthrough that the old subscribeEmail override provided as a side effect.
vi.mock("@ecency/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ecency/sdk")>();
  return { ...actual };
});

/**
 * The Turnstile widget, mocked. The real one appends a Cloudflare <script> that jsdom
 * never runs, so the token would never arrive and the form would stay unsubmittable.
 * The mock renders nothing and hands the test the callbacks.
 */
const captcha = vi.hoisted(() => ({
  verify: null as null | ((token: string) => void),
  resets: 0
}));
vi.mock("@/features/shared/turnstile", () => ({
  TURNSTILE_SITEKEY: "test-sitekey",
  Turnstile: ({
    onVerify,
    ref
  }: {
    onVerify: (token: string) => void;
    ref?: { current: { reset: () => void } | null };
  }) => {
    captcha.verify = onVerify;
    if (ref) ref.current = { reset: () => { captcha.resets += 1; } };
    return null;
  }
}));

const CAPTCHA_TOKEN = "turnstile-test-token";

/** Solve the challenge the way a reader does before the button becomes usable. */
async function solveCaptcha() {
  await act(async () => {
    captcha.verify?.(CAPTCHA_TOKEN);
  });
}

// The form subscribes through the newsletter service; mock its browser client.
type NewsletterModule = typeof import("@/features/newsletter");
type SubscribeFn = NewsletterModule["newsletterApi"]["subscribe"];
const mockSubscribe = vi.fn<SubscribeFn>();
vi.mock("@/features/newsletter", async (importOriginal) => {
  const actual = await importOriginal<NewsletterModule>();
  return {
    ...actual,
    newsletterApi: { ...actual.newsletterApi, subscribe: (...args: Parameters<SubscribeFn>) => mockSubscribe(...args) }
  };
});

vi.mock("@/features/shared/feedback", () => ({
  error: vi.fn(),
  success: vi.fn()
}));

vi.mock("@/features/shared/linear-progress", () => ({
  LinearProgress: () => <div data-testid="linear-progress" />
}));

vi.mock("@ui/svg", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, scrollDown: "<svg data-testid='scroll-down-icon' />" };
});

// LandingTrending is an async server component that fetches ranked posts via
// prefetchQuery; stub it so the test drives the rendered output deterministically.
const mockPrefetchQuery = vi.fn();
vi.mock("@/core/react-query", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, prefetchQuery: (...args: any[]) => mockPrefetchQuery(...args) };
});

// Extend the global @/utils mock with landing-page-specific exports
vi.mock("@/utils", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    handleInvalid: vi.fn(),
    handleOnInput: vi.fn()
  };
});

import { LandingHeroActions } from "@/app/_components/landing-page/landing-hero-actions";
import { LandingSubscribeForm } from "@/app/_components/landing-page/landing-subscribe-form";
import { LandingSignInLink } from "@/app/_components/landing-page/landing-sign-in-link";
import { LandingDownloadLinks } from "@/app/_components/landing-page/landing-download-links";
import { LandingExplore } from "@/app/_components/landing-page/landing-explore";
import { LandingTrending } from "@/app/_components/landing-page/landing-trending";
import { success, error as errorFn } from "@/features/shared/feedback";

describe("LandingHeroActions", () => {
  it("renders explore and get started links", () => {
    render(<LandingHeroActions />);
    expect(screen.getByText("landing-page.explore")).toBeInTheDocument();
    expect(screen.getByText("landing-page.get-started")).toBeInTheDocument();
  });

  it("renders accessible scroll button", () => {
    render(<LandingHeroActions />);
    const scrollBtn = screen.getByRole("button", { name: "landing-page.scroll-down" });
    expect(scrollBtn).toBeInTheDocument();
    expect(scrollBtn).toHaveClass("scroll-down");
  });

  it("smooth-scrolls down on click", () => {
    const scrollBySpy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});

    render(<LandingHeroActions />);
    fireEvent.click(screen.getByRole("button", { name: "landing-page.scroll-down" }));
    expect(scrollBySpy).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" })
    );

    scrollBySpy.mockRestore();
  });
});

describe("LandingExplore", () => {
  it("renders topic hub links and discovery links with canonical hrefs", () => {
    render(<LandingExplore />);
    expect(screen.getByRole("link", { name: "#hive" })).toHaveAttribute(
      "href",
      "/trending/hive"
    );
    expect(
      screen.getByRole("link", { name: "landing-page.popular-communities" })
    ).toHaveAttribute("href", "/communities");
    expect(screen.getByRole("link", { name: "landing-page.discover" })).toHaveAttribute(
      "href",
      "/discover"
    );
  });
});

describe("LandingTrending", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders bare /@author/permlink links and filters NSFW posts", async () => {
    mockPrefetchQuery.mockResolvedValue([
      {
        author: "alice",
        permlink: "hello-world",
        title: "Hello World",
        category: "life",
        community_title: "Life",
        body: "",
        json_metadata: { tags: ["life"] },
        created: "2024-01-01T00:00:00"
      },
      {
        author: "bob",
        permlink: "adult-post",
        title: "Adult thing",
        category: "hive-125278", // curated NSFW community
        body: "",
        json_metadata: { tags: [] },
        created: "2024-01-01T00:00:00"
      }
    ]);

    render(await LandingTrending());

    const link = screen.getByRole("link", { name: /Hello World/ });
    expect(link).toHaveAttribute("href", "/@alice/hello-world");
    // NSFW community post must not appear on the anonymous homepage.
    expect(screen.queryByText("Adult thing")).not.toBeInTheDocument();
  });

  it("renders nothing when there are no trending posts", async () => {
    mockPrefetchQuery.mockResolvedValue([]);
    expect(await LandingTrending()).toBeNull();
  });
});

describe("LandingSubscribeForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captcha.verify = null;
    captcha.resets = 0;
  });

  it("renders email input, cadence choice and submit button", () => {
    render(<LandingSubscribeForm />);
    expect(screen.getByPlaceholderText("landing-page.enter-your-email-adress")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("weekly");
    expect(screen.getByText("landing-page.send")).toBeInTheDocument();
  });

  it("subscribes the address to the site digest through the service and shows check-your-inbox on pending", async () => {
    // What the service returns to an unproven caller: this and nothing more.
    mockSubscribe.mockResolvedValue({ status: "pending_confirmation" });

    render(<LandingSubscribeForm />);
    const input = screen.getByPlaceholderText("landing-page.enter-your-email-adress");
    fireEvent.change(input, { target: { value: "  test@example.com " } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "monthly" } });
    await solveCaptcha();
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(mockSubscribe).toHaveBeenCalledWith(
        {
          email: "test@example.com",
          type: "site",
          target: "ecency",
          cadence: "monthly",
          source: "landing-page",
          captchaToken: CAPTCHA_TOKEN
        },
        undefined // anonymous: no account attributed
      );
      expect(success).toHaveBeenCalledWith("landing-page.check-inbox");
    });
    // The form is replaced by the instruction; nothing else to do here.
    expect(screen.getByText("landing-page.check-inbox")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("landing-page.enter-your-email-adress")).not.toBeInTheDocument();
  });

  it("shows the subscribed state in the page when a proven caller is active at once", async () => {
    mockSubscribe.mockResolvedValue({ status: "active", created: true });
    render(<LandingSubscribeForm />);
    const input = screen.getByPlaceholderText("landing-page.enter-your-email-adress");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    await solveCaptcha();
    fireEvent.submit(input.closest("form")!);
    // The visible outcome, not only the toast: the message replaces the form.
    expect(await screen.findByText("landing-page.success-message-subscribe")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("landing-page.enter-your-email-adress")).not.toBeInTheDocument();
    expect(success).toHaveBeenCalledWith("landing-page.success-message-subscribe");
  });

  it("shows an error on API failure and keeps the form", async () => {
    mockSubscribe.mockRejectedValue(new Error("Network error"));

    render(<LandingSubscribeForm />);
    const input = screen.getByPlaceholderText("landing-page.enter-your-email-adress");
    fireEvent.change(input, { target: { value: "test@example.com" } });
    await solveCaptcha();
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(errorFn).toHaveBeenCalledWith("landing-page.error-occured"));
    expect(screen.getByPlaceholderText("landing-page.enter-your-email-adress")).toBeInTheDocument();
    expect(screen.getByText("landing-page.send")).toBeInTheDocument();
  });

  it("says the service is unavailable, not 'server error', on 502/503/504", async () => {
    const { NewsletterApiError } = await import("@/features/newsletter");
    for (const status of [502, 503, 504]) {
      vi.mocked(errorFn).mockClear();
      mockSubscribe.mockRejectedValueOnce(new NewsletterApiError("down", status));
      const { unmount } = render(<LandingSubscribeForm />);
      const input = screen.getByPlaceholderText("landing-page.enter-your-email-adress");
      fireEvent.change(input, { target: { value: "test@example.com" } });
      await solveCaptcha();
    fireEvent.submit(input.closest("form")!);
      await waitFor(() => expect(errorFn).toHaveBeenCalledWith("newsletter.error-unavailable"));
      unmount();
    }
  });
});

describe("LandingSignInLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders as a button element", () => {
    render(<LandingSignInLink />);
    const btn = screen.getByRole("button", { name: "landing-page.sign-in" });
    expect(btn).toBeInTheDocument();
    expect(btn.tagName).toBe("BUTTON");
  });

  it("triggers login dialog on click", () => {
    render(<LandingSignInLink />);
    fireEvent.click(screen.getByRole("button", { name: "landing-page.sign-in" }));
    expect(mockToggleUiProp).toHaveBeenCalledWith("login");
  });
});

describe("LandingDownloadLinks", () => {
  const props = {
    iosIcon: "/icon-apple.svg",
    iosIconWhite: "/icon-apple-white.svg",
    androidIcon: "/icon-android.svg",
    androidIconWhite: "/icon-android-white.svg"
  };

  it("renders iOS and Android links with correct targets and security attrs", () => {
    render(<LandingDownloadLinks {...props} />);
    const externalLinks = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("target") === "_blank");
    // iOS and Android are the only external links; the PWA install entry
    // is an internal /mobile link.
    expect(externalLinks).toHaveLength(2);
    externalLinks.forEach((link) => {
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    });
  });

  it("renders the internal PWA install link pointing to /mobile", () => {
    render(<LandingDownloadLinks {...props} />);
    const pwaLink = screen.getByRole("link", {
      name: /landing-page\.install-web-app/
    });
    expect(pwaLink).toHaveAttribute("href", "/mobile");
    // The PWA link must not have target=_blank since it's an in-app route.
    expect(pwaLink).not.toHaveAttribute("target");
  });

  it("shows day theme icons when theme is day", () => {
    mockTheme = "day";
    render(<LandingDownloadLinks {...props} />);
    const images = screen.getAllByRole("img");
    expect(images[0]).toHaveAttribute("src", "/icon-apple.svg");
    expect(images[1]).toHaveAttribute("src", "/icon-android.svg");
  });

  it("shows night theme icons when theme is night", () => {
    mockTheme = "night";
    render(<LandingDownloadLinks {...props} />);
    const images = screen.getAllByRole("img");
    expect(images[0]).toHaveAttribute("src", "/icon-apple-white.svg");
    expect(images[1]).toHaveAttribute("src", "/icon-android-white.svg");
    mockTheme = "day"; // reset
  });
});
