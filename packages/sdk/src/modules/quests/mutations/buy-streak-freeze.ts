import { CONFIG, getBoundFetch, QueryKeys } from "@/modules/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { StreakFreezeBuyResult } from "../types";

/** A fresh idempotency key per purchase; guarded for runtimes without crypto.randomUUID. */
function genIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * POST a single streak-freeze purchase. Throws on a non-2xx with the server's
 * `.status` + parsed `.data` attached so the caller can branch on 402 (insufficient)
 * / 409 (max owned). Exported for unit testing; the hook below wraps it.
 */
export async function buyStreakFreezeRequest(
  code: string
): Promise<StreakFreezeBuyResult> {
  const fetchApi = getBoundFetch();
  const response = await fetchApi(
    CONFIG.privateApiHost + "/private-api/streak-freeze/buy",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, idempotency_key: genIdempotencyKey() }),
    }
  );

  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const body = await response.text();

  if (!response.ok) {
    let data: unknown = undefined;
    if (contentType.includes("json")) {
      try {
        data = JSON.parse(body);
      } catch {
        // non-JSON error body; fall through with status only
      }
    }
    const message =
      (data as { message?: string })?.message ??
      `Failed to buy streak freeze: ${response.status}`;
    const err = new Error(message) as Error & { status?: number; data?: unknown };
    err.status = response.status;
    err.data = data;
    throw err;
  }

  if (!contentType.includes("json")) {
    throw new Error(
      `[SDK][StreakFreeze] – expected JSON but received "${contentType || "empty"}" response (status ${response.status})`
    );
  }

  try {
    return JSON.parse(body) as StreakFreezeBuyResult;
  } catch {
    throw new Error(
      `[SDK][StreakFreeze] – malformed JSON response (status ${response.status})`
    );
  }
}

/**
 * Buy one streak freeze (a Points-only sink). The server debits Points, caps owned
 * inventory, and is idempotent per key. On success the quests + points caches are
 * invalidated so the owned count and balance refresh. A 402 (insufficient) / 409 (max
 * owned) is rethrown with `.status` + `.data` so the caller can route to a Points top-up.
 */
export function useBuyStreakFreeze(
  username: string | undefined,
  code: string | undefined
) {
  const queryClient = useQueryClient();
  const name = username?.replace("@", "");

  return useMutation({
    mutationKey: ["streak-freeze", "buy", name],
    mutationFn: async () => {
      if (!name || !code) {
        throw new Error("[SDK][StreakFreeze] – missing auth");
      }
      return buyStreakFreezeRequest(code);
    },
    onSuccess() {
      // Balance only changes on a successful debit.
      if (name) {
        queryClient.invalidateQueries({ queryKey: QueryKeys.points._prefix(name) });
      }
    },
    onSettled() {
      // Refresh freezes_owned on success AND error: a 409 (max owned) means the
      // client's count is stale, and without this the "Protect streak" button would
      // never hide and the user could keep re-triggering 409s.
      if (name) {
        queryClient.invalidateQueries({ queryKey: QueryKeys.quests.status(name) });
      }
    },
  });
}
