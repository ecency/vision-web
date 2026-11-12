import type { Operation, TransactionConfirmation } from "../../index";

type HiveAuthKeyType = "posting" | "active";

export type HiveAuthBroadcastHandler = (
  username: string,
  operations: Operation[],
  keyType: HiveAuthKeyType
) => Promise<TransactionConfirmation>;

let broadcastHandler: HiveAuthBroadcastHandler | null = null;

export function registerHiveAuthBroadcastHandler(handler: HiveAuthBroadcastHandler) {
  broadcastHandler = handler;
}

export function getHiveAuthBroadcastHandler(): HiveAuthBroadcastHandler | null {
  return broadcastHandler;
}
