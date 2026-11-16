import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAutosavePointer,
  readAutosavePointer,
  writeAutosavePointer
} from "@/app/publish/_utils/autosave-pointer";

// The pointer is a draft id, never a copy of the post: /publish keeps its content
// on the server, and this only remembers which server draft it was writing to.
describe("autosave pointer", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("round-trips the id and time per user", () => {
    writeAutosavePointer("alice", "d1", 1000);
    writeAutosavePointer("bob", "d2", 2000);

    expect(readAutosavePointer("alice")).toEqual({ id: "d1", savedAt: 1000 });
    expect(readAutosavePointer("bob")).toEqual({ id: "d2", savedAt: 2000 });
  });

  it("stores the id only, not the post", () => {
    writeAutosavePointer("alice", "d1", 1000);

    const stored = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? "");
    expect(stored).toHaveLength(1);
    expect(JSON.parse(stored[0])).toEqual({ id: "d1", savedAt: 1000 });
  });

  it("ignores a malformed entry", () => {
    writeAutosavePointer("alice", "d1", 1000);
    const key = Object.keys(localStorage)[0];
    localStorage.setItem(key, JSON.stringify({ id: 42 }));

    expect(readAutosavePointer("alice")).toBeUndefined();
  });

  it("clears only the draft it is asked about", () => {
    writeAutosavePointer("alice", "d1", 1000);

    clearAutosavePointer("alice", "other");
    expect(readAutosavePointer("alice")?.id).toBe("d1");

    clearAutosavePointer("alice", "d1");
    expect(readAutosavePointer("alice")).toBeUndefined();
  });

  it("clears unconditionally when no id is given", () => {
    writeAutosavePointer("alice", "d1", 1000);
    clearAutosavePointer("alice");
    expect(readAutosavePointer("alice")).toBeUndefined();
  });

  // Private windows and blocked site data throw on access. The composer must
  // keep working; the prompt simply does not appear.
  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });

    expect(() => writeAutosavePointer("alice", "d1", 1000)).not.toThrow();
    expect(readAutosavePointer("alice")).toBeUndefined();
    expect(() => clearAutosavePointer("alice")).not.toThrow();
  });
});
