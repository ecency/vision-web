import React from "react";
import { act, render } from "@testing-library/react";
import { renderPostBody } from "@ecency/render-helper";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// Imported by file path on purpose: setup-any-spec stubs the "@/features/post-renderer"
// barrel to a null component for every other spec.
import { EcencyRenderer } from "@/features/post-renderer/components/ecency-renderer";
import { setupPostEnhancements } from "@/features/post-renderer/components/utils/setupPostEnhancements";

vi.mock("@ecency/render-helper", async () => ({
  ...(await vi.importActual<typeof import("@ecency/render-helper")>("@ecency/render-helper")),
  renderPostBody: vi.fn()
}));

// The wave preview builds its link with makeEntryPath, which the global
// @/utils stub lacks.
vi.mock("@/utils", async () => ({
  ...(await vi.importActual("@/utils"))
}));

const Tweet = ({ id }: { id: string }) => <span className="tweet">{id}</span>;

const OP = btoa(JSON.stringify(["transfer", { to: "alice", amount: "1.000 HIVE" }]));
const tweetLink = (id: string) =>
  `<a class="markdown-external-link" href="https://x.com/alice/status/${id}">https://x.com/alice/status/${id}</a>`;
const opLink = `<a class="markdown-external-link" href="#">hive://sign/op/${OP}</a>`;
const postLink = `<a class="markdown-post-link" data-is-inline="true" href="/hive-1/@alice/my-post">/hive-1/@alice/my-post</a>`;
const waveLink = `<a class="markdown-post-link" data-is-inline="true" href="/ecency.waves/@alice/wave-abc">/ecency.waves/@alice/wave-abc</a>`;

// unmountRootsLater defers root teardown to a microtask.
const flush = () => act(async () => {});

// jsdom has no innerText; the hive-op enhancers read it.
const innerText = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerText");
beforeAll(() => {
  // The post preview fetches its card; keep it pending so the link fallback shows.
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  Object.defineProperty(HTMLElement.prototype, "innerText", {
    configurable: true,
    get(this: HTMLElement) {
      return this.textContent ?? "";
    },
    set(this: HTMLElement, value: string) {
      this.textContent = value;
    }
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  if (innerText) Object.defineProperty(HTMLElement.prototype, "innerText", innerText);
  else delete (HTMLElement.prototype as { innerText?: string }).innerText;
});

describe("post renderer link enhancers survive re-renders and re-runs (#2083)", () => {
  let host: HTMLDivElement;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    consoleError = vi.spyOn(console, "error");
  });

  afterEach(() => {
    host.remove();
    vi.mocked(renderPostBody).mockReset();
    consoleError.mockRestore();
  });

  // The extensions tear their roots down from an effect cleanup; a synchronous
  // root.unmount() there makes React log this error (#1939).
  const expectNoSyncUnmount = () =>
    expect(
      consoleError.mock.calls.map((call) => String(call[0])).filter((m) => m.includes("synchronously unmount"))
    ).toEqual([]);

  it("EcencyRenderer enhances the tweet and the hive operation again when the html changes", async () => {
    vi.mocked(renderPostBody).mockReturnValue(`<p>${tweetLink("1")} ${opLink}</p>`);
    const { rerender } = render(<EcencyRenderer value="one" TwitterComponent={Tweet} />, {
      container: host
    });
    await flush();
    expect(host.querySelectorAll(".tweet")).toHaveLength(1);
    expect(host.querySelectorAll(".er-hive-op .er-hive-op-label")).toHaveLength(1);

    vi.mocked(renderPostBody).mockReturnValue(`<p>${tweetLink("2")} ${opLink}</p>`);
    rerender(<EcencyRenderer value="two" TwitterComponent={Tweet} />);
    await flush();

    expect(Array.from(host.querySelectorAll(".tweet"), (t) => t.textContent)).toEqual(["2"]);
    expect(host.querySelectorAll(".er-hive-op .er-hive-op-label")).toHaveLength(1);
    expectNoSyncUnmount();
  });

  it("EcencyRenderer enhances post and wave links again when the html changes", async () => {
    vi.mocked(renderPostBody).mockReturnValue(`<p>${postLink}</p><p>${waveLink}</p>`);
    // At embedDepth 1 a wave link renders its stub right away, with no fetch.
    const { rerender } = render(<EcencyRenderer value="one" embedDepth={1} />, {
      container: host
    });
    await flush();
    vi.mocked(renderPostBody).mockReturnValue(`<p>${postLink} </p><p>${waveLink}</p>`);
    rerender(<EcencyRenderer value="two" embedDepth={1} />);
    await flush();

    expect(host.querySelectorAll(".er-post-link a.er-post-link-link")).toHaveLength(1);
    expect(host.querySelectorAll(".er-wave .er-wave-renderer--stub")).toHaveLength(1);
    expect(host.querySelector('a.markdown-post-link[href$="wave-abc"]')).toBeNull();
    expectNoSyncUnmount();
  });

  it("EcencyRenderer wraps the new images for zoom when the html changes", async () => {
    vi.mocked(renderPostBody).mockReturnValue(`<p><img src="https://images.ecency.com/a.png"></p>`);
    const { rerender } = render(<EcencyRenderer value="one" />, { container: host });
    await flush();
    vi.mocked(renderPostBody).mockReturnValue(`<p><img src="https://images.ecency.com/b.png"></p>`);
    rerender(<EcencyRenderer value="two" />);
    await flush();

    expect(
      host.querySelector('.markdown-image-container img[src="https://images.ecency.com/b.png"]')
    ).not.toBeNull();
  });

  it("an extension re-run on the same DOM (Strict Mode) leaves every link enhanced once", async () => {
    vi.mocked(renderPostBody).mockReturnValue(
      `<p>${tweetLink("1")} ${opLink}</p><p>${postLink}</p><p>${waveLink}</p>`
    );
    render(
      <React.StrictMode>
        <EcencyRenderer value="one" TwitterComponent={Tweet} embedDepth={1} />
      </React.StrictMode>,
      { container: host }
    );
    await flush();

    expect(host.querySelectorAll(".tweet")).toHaveLength(1);
    expect(host.querySelectorAll(".er-hive-op .er-hive-op-label")).toHaveLength(1);
    expect(host.querySelectorAll(".er-post-link a.er-post-link-link")).toHaveLength(1);
    expect(host.querySelectorAll(".er-wave")).toHaveLength(1);
    expect(host.querySelectorAll(".er-wave .er-wave-renderer--stub")).toHaveLength(1);
    expect(host.querySelector('a.markdown-post-link[href$="wave-abc"]')).toBeNull();
    expect(
      host.querySelectorAll(".er-twitter-frame:empty, .er-hive-op:empty, .er-post-link:empty, .er-wave:empty")
    ).toHaveLength(0);
    expectNoSyncUnmount();
  });

  it("setupPostEnhancements run, cleaned up and run again enhances each link once, no empty wrapper", async () => {
    host.innerHTML =
      `<div class="markdown-view"><p>${tweetLink("1")} ${opLink}</p>` +
      `<p>${postLink}</p><p>${waveLink}</p></div>`;
    const body = host.firstElementChild as HTMLElement;

    let cleanup!: () => void;
    await act(async () => {
      cleanup = setupPostEnhancements(body, { TwitterComponent: Tweet });
    });
    await act(async () => {
      cleanup();
    });

    // Cleanup puts the original links back.
    expect(body.querySelectorAll(".er-twitter-frame, .er-hive-op, .er-post-link, .er-wave")).toHaveLength(0);
    expect(body.querySelector('a[href="https://x.com/alice/status/1"]')?.textContent).toBe(
      "https://x.com/alice/status/1"
    );
    expect(body.querySelectorAll("a.markdown-post-link")).toHaveLength(2);

    await act(async () => {
      cleanup = setupPostEnhancements(body, { TwitterComponent: Tweet });
    });

    expect(body.querySelectorAll(".er-twitter-frame .tweet")).toHaveLength(1);
    expect(body.querySelectorAll(".er-hive-op .er-hive-op-label")).toHaveLength(1);
    expect(body.querySelectorAll(".er-post-link a.er-post-link-link")).toHaveLength(1);
    expect(body.querySelectorAll(".er-wave")).toHaveLength(1);
    expect(body.querySelector('a.markdown-post-link[href$="wave-abc"]')).toBeNull();
    expect(
      body.querySelectorAll(".er-twitter-frame:empty, .er-hive-op:empty, .er-post-link:empty")
    ).toHaveLength(0);

    await act(async () => {
      cleanup();
    });
  });
});
