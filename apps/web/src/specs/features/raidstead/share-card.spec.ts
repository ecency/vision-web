import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { up } = vi.hoisted(() => ({
  up: {
    token: vi.fn(async (): Promise<string | undefined> => "token"),
    upload: vi.fn(async () => ({ url: "https://images.ecency.com/DQm/card.png" }))
  }
}));
vi.mock("@ecency/sdk", async (orig) => ({ ...(await orig<object>()), uploadImage: up.upload }));
vi.mock("@/utils/user-token", () => ({ ensureValidToken: up.token }));
vi.mock("@/api/sdk-mutations/upload-image-retry", () => ({
  withUploadRetry: (run: () => Promise<unknown>) => run()
}));

import { CARD_WAIT_MS, shareCardImage } from "@/features/raidstead/share-card";

const card = {
  kind: "beetle",
  title: "Ink & Oak",
  outcome: "chased off",
  week: "Season 2, week 1",
  topLabel: "Top raiders",
  top: [{ account: "ann", damage: 40 }]
};

// jsdom has no 2D canvas: a context that takes every call, or none at all
const recorder = () =>
  new Proxy({} as Record<string, unknown>, {
    get: (o, k: string) => (k in o ? o[k] : () => undefined),
    set: (o, k: string, v) => ((o[k] = v), true)
  });

describe("share card image", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    up.token.mockImplementation(async () => "token");
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
      cb(new Blob(["png"], { type: "image/png" }));
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("uploads the drawn card as the player and gives its address", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => recorder()) as never);
    expect(await shareCardImage(card, "ann")).toBe("https://images.ecency.com/DQm/card.png");
    expect(up.token).toHaveBeenCalledWith("ann");
    expect(up.upload).toHaveBeenCalledTimes(1);
  });

  it("uploads nothing when the card could not be drawn (no 2D canvas)", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => null) as never);
    expect(await shareCardImage(card, "ann")).toBeNull();
    expect(up.upload).not.toHaveBeenCalled();
  });

  it("gives up after CARD_WAIT_MS, whatever it is waiting on", async () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => recorder()) as never);
    // a login token that never comes
    up.token.mockImplementation(() => new Promise<string | undefined>(() => undefined));
    let result: string | null | "waiting" = "waiting";
    void shareCardImage(card, "ann").then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(CARD_WAIT_MS + 1);
    expect(result).toBeNull();
    expect(up.upload).not.toHaveBeenCalled();
  });
});
