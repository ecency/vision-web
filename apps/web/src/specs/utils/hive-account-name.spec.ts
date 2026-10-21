import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { accountExists, isValidAccountName, normalizeAccountName } from "@/utils/hive-account-name";

const lookup = vi.hoisted(() => ({ existing: new Set<string>() }));

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@ecency/sdk")),
  getAccountsQueryOptions: (names: string[]) => ({
    queryKey: ["accounts", ...names],
    queryFn: async () =>
      names.filter((name) => lookup.existing.has(name)).map((name) => ({ name }))
  })
}));

describe("normalizeAccountName", () => {
  it("strips a leading @, spaces and casing so the chain gets a bare name", () => {
    expect(normalizeAccountName("@melinda010100")).toBe("melinda010100");
    expect(normalizeAccountName("  @@Trustee ")).toBe("trustee");
    expect(normalizeAccountName("%40Alice")).toBe("alice");
    expect(normalizeAccountName("@ alice")).toBe("alice");
    expect(normalizeAccountName(undefined)).toBe("");
  });

  it("keeps an @ or %40 inside the name so it cannot become another account", () => {
    expect(normalizeAccountName("alice%40bob")).toBe("alice%40bob");
    expect(normalizeAccountName("alice@bob")).toBe("alice@bob");
  });
});

describe("isValidAccountName", () => {
  it("accepts names typed with @ and every shape the chain allows", () => {
    expect(isValidAccountName("@melinda010100")).toBe(true);
    expect(isValidAccountName("good.name")).toBe(true);
    expect(isValidAccountName("a-b")).toBe(true);
    expect(isValidAccountName("a".repeat(16))).toBe(true);
  });

  it("rejects names the chain would refuse", () => {
    expect(isValidAccountName("")).toBe(false);
    expect(isValidAccountName("ab")).toBe(false);
    expect(isValidAccountName("1abc")).toBe(false);
    expect(isValidAccountName("bad_name")).toBe(false);
    expect(isValidAccountName("abc-")).toBe(false);
    expect(isValidAccountName("abc.de")).toBe(false);
    expect(isValidAccountName("a".repeat(17))).toBe(false);
    expect(isValidAccountName("alice%40bob")).toBe(false);
    expect(isValidAccountName("alice@bob")).toBe(false);
  });
});

describe("accountExists", () => {
  it("asks the chain again instead of trusting a cached not-found", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
    lookup.existing = new Set();
    expect(await accountExists(queryClient, "@NewUser")).toBe(false);

    // The account gets created right after the first lookup cached [].
    lookup.existing.add("newuser");
    expect(await accountExists(queryClient, "newuser")).toBe(true);
  });
});
