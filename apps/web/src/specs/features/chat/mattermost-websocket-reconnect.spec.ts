import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { MattermostWebSocket } from "@/features/chat/mattermost-websocket";

/**
 * Cloudflare drops a websocket that carries no data for 100s. The client used to
 * ping every 2 min when idle and 3 min in a hidden tab, so those sockets died,
 * and events sent before the reconnect were never shown.
 */

class FakeSocket {
  static instances: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: ((evt: { code: number; wasClean: boolean }) => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onerror: ((evt: unknown) => void) | null = null;
  readyState = 0;
  send = vi.fn();
  close = vi.fn();
  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  hello() {
    this.onmessage?.({ data: JSON.stringify({ event: "hello", seq: 0 }) });
  }
  pong() {
    this.onmessage?.({ data: JSON.stringify({ status: "OK", data: { text: "pong" } }) });
  }
}

const CLOUDFLARE_IDLE_LIMIT_MS = 100_000;

function setHidden(hidden: boolean) {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("MattermostWebSocket keepalive and reconnect", () => {
  let qc: QueryClient;
  let ws: MattermostWebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    qc = new QueryClient();
    ws = new MattermostWebSocket().withQueryClient(qc).withChannel("channel-1");
  });

  afterEach(() => {
    ws.disconnect();
    setHidden(false);
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function open() {
    await ws.connect();
    const socket = FakeSocket.instances[FakeSocket.instances.length - 1];
    socket.onopen?.();
    return socket;
  }

  async function dropAndReopen(socket: FakeSocket) {
    socket.onclose?.({ code: 1006, wasClean: false });
    await vi.runOnlyPendingTimersAsync();
    const next = FakeSocket.instances[FakeSocket.instances.length - 1];
    expect(next).not.toBe(socket);
    next.onopen?.();
    return next;
  }

  it("keeps every ping interval under the Cloudflare idle limit", () => {
    const intervals = ws as unknown as Record<"PING_ACTIVE" | "PING_IDLE" | "PING_BACKGROUND", number>;
    for (const key of ["PING_ACTIVE", "PING_IDLE", "PING_BACKGROUND"] as const) {
      // At most a minute, so hidden-tab throttling (rounding timers up to about a
      // minute) still keeps the socket well inside the limit.
      expect(intervals[key]).toBeLessThanOrEqual(60_000);
      expect(intervals[key]).toBeLessThan(CLOUDFLARE_IDLE_LIMIT_MS);
    }
  });

  it("does not refetch on the first connect", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const socket = await open();
    socket.hello();

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("refetches the open channel, its pins, threads, unreads and channel list once a reconnect is authenticated", async () => {
    const first = await open();
    first.hello();

    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const second = await dropAndReopen(first);
    expect(invalidate).not.toHaveBeenCalled(); // open alone does not prove Mattermost is up

    second.hello();
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        ["mattermost-posts-infinite", "channel-1"],
        ["mattermost-pinned-posts", "channel-1"],
        ["mattermost-thread"],
        ["mattermost-unread"],
        ["mattermost-channels"]
      ])
    );
  });

  it("backs off and does not refetch while the chat server is unreachable", async () => {
    const first = await open();
    first.hello();
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    // The proxy accepts each socket, then closes it because upstream is down: no hello.
    let socket = first;
    for (let i = 0; i < 4; i++) {
      socket = await dropAndReopen(socket);
    }

    expect(invalidate).not.toHaveBeenCalled();
    // Attempts keep counting up (so the delay grows) instead of resetting on each open.
    expect((ws as unknown as { reconnectAttempts: number }).reconnectAttempts).toBe(4);
  });

  it("reports active only once Mattermost says hello, so the UI fallback stays on during an outage", async () => {
    const active: boolean[] = [];
    ws.onConnectionChange((value) => active.push(value));

    const first = await open();
    expect(active).toEqual([]);
    first.hello();
    expect(active).toEqual([true]);

    let socket = first;
    for (let i = 0; i < 3; i++) {
      socket = await dropAndReopen(socket); // opens, but no hello
    }
    expect(active).toEqual([true, false]);

    socket.hello();
    expect(active).toEqual([true, false, true]);
  });

  it("stays connected on a visible tab that has been idle for a long time", async () => {
    const socket = await open();
    socket.hello();
    socket.send.mockImplementation(() => setTimeout(() => socket.pong(), 50));

    await vi.advanceTimersByTimeAsync(20 * 60_000);

    expect(socket.close).not.toHaveBeenCalled();
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("does not close a healthy socket when the tab is hidden mid-interval", async () => {
    const socket = await open();
    socket.hello();
    // Answer each ping shortly after, like the server does.
    socket.send.mockImplementation(() => setTimeout(() => socket.pong(), 50));

    await vi.advanceTimersByTimeAsync(30_000); // first active ping
    await vi.advanceTimersByTimeAsync(15_000); // hide 15s after it
    setHidden(true);
    await vi.advanceTimersByTimeAsync(5 * 60_000);

    expect(socket.close).not.toHaveBeenCalled();
    expect(FakeSocket.instances).toHaveLength(1);

    setHidden(false); // and back again
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(socket.close).not.toHaveBeenCalled();
  });
});
