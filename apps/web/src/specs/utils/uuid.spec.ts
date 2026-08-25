import { describe, it, expect, vi, afterEach } from "vitest";

import { uuidV4 } from "@/utils/uuid";

const V4_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuidV4", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("produces RFC 4122 v4 formatted ids", () => {
    for (let i = 0; i < 32; i++) {
      expect(uuidV4()).toMatch(V4_SHAPE);
    }
  });

  it("produces unique values", () => {
    const ids = new Set(Array.from({ length: 100 }, () => uuidV4()));
    expect(ids.size).toBe(100);
  });

  // Chrome Mobile <92 ships getRandomValues but not randomUUID; the signup page
  // crashed there (ECENCY-NEXT-1GAZ). Pin that uuidV4 never reaches for randomUUID.
  it("works when crypto.randomUUID is unavailable", () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal("crypto", { getRandomValues });
    expect(uuidV4()).toMatch(V4_SHAPE);
  });

  it("zero-pads low bytes", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (arr: Uint8Array) => {
        arr.fill(0);
        return arr;
      }
    });
    expect(uuidV4()).toBe("00000000-0000-4000-8000-000000000000");
  });

  // padStart is ES2017 and absent on part of the range this helper targets
  // (Chrome 49-56, Firefox 36-47, Safari 9); the app strips Next's client polyfills.
  it("works when String.prototype.padStart is unavailable", () => {
    const proto = String.prototype as { padStart?: typeof String.prototype.padStart };
    const padStart = proto.padStart;
    delete proto.padStart;
    try {
      expect(uuidV4()).toMatch(V4_SHAPE);
    } finally {
      proto.padStart = padStart;
    }
  });
});
