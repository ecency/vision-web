import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadImage } from "./requests";

// Issue #1651: the access token must travel in the Authorization header, never
// in the URL, where Sentry breadcrumbs, proxies and logs record it verbatim.
describe("uploadImage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    const body = { url: "https://images.ecency.com/DQmX/a.png" };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const file = () => new File(["x"], "a.png", { type: "image/png" });
  const TOKEN = "eyJ.secret-token/with+chars";

  it("posts to /hs with the token as a Bearer header", async () => {
    const res = await uploadImage(file(), TOKEN);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toBe("https://i.ecency.com/hs");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe(`Bearer ${TOKEN}`);
    expect(res).toEqual({ url: "https://images.ecency.com/DQmX/a.png" });
  });

  it("never puts the token in the URL", async () => {
    await uploadImage(file(), TOKEN);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("secret-token");
  });

  it("sends the file as multipart form data and passes the abort signal", async () => {
    const abort = new AbortController();
    await uploadImage(file(), TOKEN, abort.signal);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    expect(init.signal).toBe(abort.signal);
    // The browser must set the multipart boundary itself.
    expect(new Headers(init.headers).has("Content-Type")).toBe(false);
  });
});
