import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { beforeAll, describe, expect, it } from "vitest";
import { PUSH_LINK_CASES } from "./push-notification-link-cases";

/**
 * Exercises the shipped service worker (public/firebase-messaging-sw.js), which
 * is the click handler for background push. It cannot import from src, so its
 * routing table is a second copy of the one in api/push-notification-link.ts.
 * Running the shared cases against the real file is what keeps the two from
 * drifting apart silently.
 */
describe("firebase-messaging-sw notificationclick", () => {
  let opened: string[];
  let waited: unknown[];
  let click: (event: unknown) => void;

  beforeAll(() => {
    // Build the path from the spec file string, not `new URL(...)` — the jsdom
    // global URL isn't recognized by Node's fileURLToPath.
    const specDir = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(
      resolve(specDir, "../../../public/firebase-messaging-sw.js"),
      "utf-8"
    );

    opened = [];
    waited = [];
    const listeners: Record<string, (event: unknown) => void> = {};
    const selfStub = {
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners[type] = listener;
      },
      registration: { showNotification: () => {} }
    };
    const firebaseStub = {
      initializeApp: () => {},
      messaging: () => ({ onBackgroundMessage: () => {} })
    };
    const clientsStub = {
      openWindow: (url: string) => {
        opened.push(url);
        return Promise.resolve(null);
      }
    };

    // Run the worker body with the service-worker globals it expects. The two
    // importScripts calls at the top are what makes `firebase` exist in a real
    // worker, so they're a no-op here and the stub stands in.
    new Function(
      "importScripts",
      "firebase",
      "self",
      "clients",
      source
    )(() => {}, firebaseStub, selfStub, clientsStub);

    expect(listeners.notificationclick).toBeTypeOf("function");
    click = listeners.notificationclick;
  });

  const openedFor = (data: Record<string, string>) => {
    opened.length = 0;
    click({
      notification: { data },
      waitUntil: (promise: unknown) => waited.push(promise)
    });
    return opened[0];
  };

  it.each(PUSH_LINK_CASES.map((c) => [c.name, c.data, c.expected] as const))(
    "%s",
    (_name, data, expected) => {
      expect(openedFor(data)).toBe(expected);
    }
  );

  it("holds the worker open until the navigation settles", () => {
    // Without waitUntil the worker can be terminated before openWindow
    // resolves, and the click intermittently opens nothing.
    waited.length = 0;
    openedFor({ type: "favorite", source: "actor", target: "recipient", permlink1: "p" });
    expect(waited).toHaveLength(1);
    expect(waited[0]).toBeInstanceOf(Promise);
  });
});
