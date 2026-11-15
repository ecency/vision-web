import { describe, expect, it, vi } from "vitest";
import { AssetOperation } from "@ecency/sdk";
import { getWalletOperationTitleKeys } from "@/features/wallet/wallet-operation-title-keys";
import enUS from "@/features/i18n/locales/en-US.json";

vi.mock("@ecency/sdk", async () => ({
  ...(await vi.importActual<typeof import("@ecency/sdk")>("@ecency/sdk"))
}));

// Hive Engine Undelegate showed the raw `transfer.undelegate-title` key, and Hive Engine
// Delegate said "Delegate Hive Power" (#1973).

function text(operation: AssetOperation, asset: string) {
  const [ns, title, sub] = getWalletOperationTitleKeys(operation, asset);
  const bag = (enUS as unknown as Record<string, Record<string, string>>)[ns];
  return { title: bag[title], sub: bag[sub] };
}

describe("wallet operation dialog title keys", () => {
  it("uses token wording for Hive Engine delegate", () => {
    const { title, sub } = text(AssetOperation.Delegate, "BEE");
    expect(title).toBe("Delegate");
    expect(sub).not.toMatch(/Hive Power/);
  });

  it("resolves a real title and subtitle for Hive Engine undelegate", () => {
    const { title, sub } = text(AssetOperation.Undelegate, "BEE");
    expect(title).toBe("Undelegate");
    expect(typeof sub).toBe("string");
  });

  it("keeps Hive Power wording for HP delegate", () => {
    expect(text(AssetOperation.Delegate, "HP").sub).toBe("Delegate Hive Power");
  });

  it("keeps the gift and withdraw routes keys", () => {
    expect(getWalletOperationTitleKeys(AssetOperation.Transfer, AssetOperation.Gift)[1]).toBe(
      "transfer-title-point"
    );
    expect(getWalletOperationTitleKeys(AssetOperation.WithdrawRoutes, "HP")[0]).toBe(
      "withdraw-routes"
    );
  });
});
