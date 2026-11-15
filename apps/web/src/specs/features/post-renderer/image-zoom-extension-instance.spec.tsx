import React from "react";
import { act, render, waitFor } from "@testing-library/react";
import { renderPostBody } from "@ecency/render-helper";
import mediumZoom from "medium-zoom";
import { afterEach, describe, expect, it, vi } from "vitest";
// Imported by file path on purpose: setup-any-spec stubs the "@/features/post-renderer"
// barrel to a null component for every other spec.
import { EcencyRenderer } from "@/features/post-renderer/components/ecency-renderer";

vi.mock("@ecency/render-helper", async () => ({
  ...(await vi.importActual<typeof import("@ecency/render-helper")>("@ecency/render-helper")),
  renderPostBody: vi.fn()
}));

const zoom = { attach: vi.fn(), detach: vi.fn() };
vi.mock("medium-zoom", () => ({ default: vi.fn(() => zoom) }));

// jsdom never loads images; the extension waits for load before zooming.
const loadImages = (root: HTMLElement) =>
  act(async () => {
    root.querySelectorAll("img").forEach((img) => img.dispatchEvent(new Event("load")));
  });

// medium-zoom adds document click/keyup/scroll and window resize listeners per
// instance and detach() only releases the images, so a new instance on every
// html change (#2083) stacked those listeners for the life of the page.
describe("ImageZoomExtension keeps one medium-zoom instance per mount", () => {
  afterEach(() => {
    vi.mocked(mediumZoom).mockClear();
    zoom.attach.mockClear();
    zoom.detach.mockClear();
  });

  it("re-attaches the new images to the same instance when the html changes", async () => {
    vi.mocked(renderPostBody).mockReturnValue(`<p><img src="https://images.ecency.com/a.png"></p>`);
    const { container, rerender } = render(<EcencyRenderer value="one" />);
    await loadImages(container);
    await waitFor(() => expect(mediumZoom).toHaveBeenCalledTimes(1));

    vi.mocked(renderPostBody).mockReturnValue(`<p><img src="https://images.ecency.com/b.png"></p>`);
    rerender(<EcencyRenderer value="two" />);
    await loadImages(container);

    await waitFor(() => expect(zoom.attach).toHaveBeenCalled());
    const attached = zoom.attach.mock.calls.flat() as HTMLImageElement[];
    expect(attached.map((img) => img.getAttribute("src"))).toEqual([
      "https://images.ecency.com/b.png"
    ]);
    expect(zoom.detach).toHaveBeenCalled();
    expect(mediumZoom).toHaveBeenCalledTimes(1);
  });
});
