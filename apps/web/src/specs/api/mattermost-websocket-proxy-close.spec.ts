// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddressInfo } from "net";
import { WebSocket, WebSocketServer } from "ws";
import { NextRequest } from "next/server";
import { closeSocketSafely, toSendableCloseCode } from "@/server/chat-socket-close";

/**
 * The chat proxy pairs a browser socket with a Mattermost socket. When one side
 * drops without a close frame (1006, e.g. an idle timeout at the edge), the other
 * side must still be closed. Forwarding 1006 as-is made `ws` throw, and the
 * error was swallowed, so the surviving socket stayed open.
 */

function listen(server: WebSocketServer) {
  return new Promise<number>((resolve) =>
    server.once("listening", () => resolve((server.address() as AddressInfo).port))
  );
}

function waitFor<T>(emitter: { once: (event: string, cb: (...args: any[]) => void) => unknown }, event: string) {
  return new Promise<T>((resolve) => emitter.once(event, (...args: any[]) => resolve(args as T)));
}

describe("toSendableCloseCode", () => {
  it("keeps codes that may appear in a close frame", () => {
    for (const code of [1000, 1001, 1008, 1011, 3000, 4999]) {
      expect(toSendableCloseCode(code)).toBe(code);
    }
  });

  it("maps local-only and invalid codes to a normal close", () => {
    for (const code of [1004, 1005, 1006, 1015, 999, 2000, 5000]) {
      expect(toSendableCloseCode(code)).toBe(1000);
    }
  });
});

describe("chat websocket proxy close handling", () => {
  let upstreamServer: WebSocketServer;
  let frontServer: WebSocketServer;
  let upstreamPort: number;
  let frontPort: number;

  beforeEach(async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    // Fake Mattermost: answers the auth challenge with hello.
    upstreamServer = new WebSocketServer({ port: 0 });
    upstreamPort = await listen(upstreamServer);
    upstreamServer.on("connection", (socket) => {
      socket.once("message", () => socket.send(JSON.stringify({ event: "hello", seq: 0 })));
    });
    vi.stubEnv("MATTERMOST_BASE_URL", `http://127.0.0.1:${upstreamPort}/api/v4`);

    // Stand-in for next-ws: hands each accepted socket to the route's UPGRADE.
    vi.resetModules();
    const { UPGRADE } = await import("@/app/api/mattermost/websocket/route");
    frontServer = new WebSocketServer({ port: 0 });
    frontPort = await listen(frontServer);
    frontServer.on("connection", (client) => {
      const request = new NextRequest("http://localhost/api/mattermost/websocket?token=test-token", {
        headers: { origin: "https://ecency.com" }
      });
      UPGRADE(client, frontServer, request);
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    upstreamServer.clients.forEach((s) => s.terminate());
    frontServer.clients.forEach((s) => s.terminate());
    await Promise.all([
      new Promise((r) => upstreamServer.close(r)),
      new Promise((r) => frontServer.close(r))
    ]);
  });

  async function connectPair() {
    const upstreamSide = waitFor<[WebSocket]>(upstreamServer, "connection");
    const browser = new WebSocket(`ws://127.0.0.1:${frontPort}`);
    const hello = waitFor(browser, "message");
    const [mattermostSocket] = await upstreamSide;
    await hello;
    return { browser, mattermostSocket };
  }

  it("closes the Mattermost side when the browser drops without a close frame", async () => {
    const { browser, mattermostSocket } = await connectPair();
    const upstreamClosed = waitFor<[number]>(mattermostSocket, "close");

    browser.terminate(); // proxy sees 1006

    const [code] = await upstreamClosed;
    expect(code).toBe(1000);
  });

  it("closes the browser side when Mattermost drops without a close frame", async () => {
    const { browser, mattermostSocket } = await connectPair();
    const browserClosed = waitFor<[number]>(browser, "close");

    mattermostSocket.terminate(); // proxy sees 1006 from upstream

    const [code] = await browserClosed;
    expect(code).toBe(1000);
  });

  it("closes the Mattermost side when the browser closes without a code", async () => {
    const { browser, mattermostSocket } = await connectPair();
    const upstreamClosed = waitFor<[number]>(mattermostSocket, "close");

    browser.close(); // proxy sees 1005, the everyday path (channel switch, unmount)

    const [code] = await upstreamClosed;
    expect(code).toBe(1000);
  });

  it("forwards a normal close code unchanged", async () => {
    const { browser, mattermostSocket } = await connectPair();
    const upstreamClosed = waitFor<[number]>(mattermostSocket, "close");

    browser.close(4001);

    const [code] = await upstreamClosed;
    expect(code).toBe(4001);
  });
});

describe("closeSocketSafely", () => {
  it("terminates when close itself throws", () => {
    const socket = {
      close: vi.fn(() => {
        throw new Error("boom");
      }),
      terminate: vi.fn()
    } as unknown as WebSocket;

    closeSocketSafely(socket, 1000);

    expect(socket.terminate).toHaveBeenCalled();
  });
});
