import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addFavoriteTagRequest, deleteFavoriteTagRequest } from "./requests";

const fetchMock = vi.fn();

const okResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

const row = (tag: string) => ({ _id: `id-${tag}`, tag, created: "2026-09-02T00:00:00+00:00", timestamp: 1 });

describe("favorite tag requests", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("add POSTs the normalised tag with the code and resolves to the updated list", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([row("photography")]));

    await expect(addFavoriteTagRequest("alice", "hs-token", "#Photography")).resolves.toEqual([
      row("photography"),
    ]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/private-api\/favorite-tags-add$/);
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      tag: "photography",
      code: "hs-token",
    });
  });

  it("delete POSTs to favorite-tags-delete", async () => {
    fetchMock.mockResolvedValueOnce(okResponse([]));

    await expect(deleteFavoriteTagRequest("alice", "hs-token", "photography")).resolves.toEqual([]);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/private-api\/favorite-tags-delete$/);
  });

  // The server would refuse these too; refusing here keeps a community name or an
  // empty string from ever becoming a request, and gives the caller a stable error.
  it("refuses an unusable tag before any request", async () => {
    for (const bad of ["hive-123456", "", "a b"]) {
      await expect(addFavoriteTagRequest("alice", "hs-token", bad)).rejects.toThrow(/invalid tag/);
      await expect(deleteFavoriteTagRequest("alice", "hs-token", bad)).rejects.toThrow(/invalid tag/);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses without auth before any request", async () => {
    await expect(addFavoriteTagRequest(undefined, undefined, "photography")).rejects.toThrow(/missing auth/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces a non-2xx status as an error rather than parsing the body as a list", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: 117 }) });
    await expect(addFavoriteTagRequest("alice", "hs-token", "photography")).rejects.toThrow(
      /Failed to add favorite tag: 409/
    );

    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    await expect(deleteFavoriteTagRequest("alice", "hs-token", "photography")).rejects.toThrow(
      /Failed to delete favorite tag: 404/
    );
  });
});
