import { afterEach, describe, expect, it, vi } from "vitest";

// #2124: the synchronous broadcast fails over on a gateway 5xx. When the first
// node had in fact accepted the transaction, the next one answers "Duplicate
// transaction check failed" for the same signed transaction. That transaction
// is on chain: report it as accepted, not as a failure the user would retry
// (and pay twice).

vi.mock("../../hive-tx", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../hive-tx")>();
  class FakeTransaction {
    transaction = { operations: [] as unknown[], signatures: ["00"] as string[] };
    async addOperation(name: string, body: unknown) {
      this.transaction.operations.push([name, body]);
    }
    sign() {
      return this.transaction;
    }
    digest() {
      return { digest: new Uint8Array(), txId: "abc123" };
    }
  }
  return { ...actual, Transaction: FakeTransaction };
});

import { broadcastOperationsWithKeys } from "./hive-tx";
import { config } from "../../hive-tx";

const transfer = [["transfer", { from: "a", to: "b", amount: "1.000 HIVE", memo: "" }]] as any;

function rpcAnswer(init: any, error: { code: number; message: string }) {
  const { id } = JSON.parse(String(init.body));
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

describe("broadcastOperationsWithKeys", () => {
  const nodes = [...config.nodes];
  afterEach(() => {
    config.nodes = [...nodes];
    vi.restoreAllMocks();
  });

  it("reports a transaction the next node calls a duplicate as accepted", async () => {
    config.nodes = ["https://gw502.test", "https://second.test"];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: any, init: any) =>
      String(input).includes("gw502")
        ? new Response("<html>502 Bad Gateway</html>", { status: 502 })
        : rpcAnswer(init, { code: -32003, message: "Duplicate transaction check failed" })
    );
    await expect(broadcastOperationsWithKeys(transfer, [{} as any])).resolves.toMatchObject({ id: "abc123" });
  });

  it("still rejects any other node error", async () => {
    config.nodes = ["https://only.test"];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input: any, init: any) =>
      rpcAnswer(init, { code: -32000, message: "missing required active authority" })
    );
    await expect(broadcastOperationsWithKeys(transfer, [{} as any])).rejects.toThrow(/missing required active authority/);
  });
});
