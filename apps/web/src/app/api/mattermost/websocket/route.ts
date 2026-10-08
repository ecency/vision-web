import { NextRequest } from "next/server";
import { WebSocket } from "ws";
import type { WebSocketServer } from "ws";
import { scrubChatSocketFrame } from "@/server/chat-public-user";

const MATTERMOST_TOKEN_COOKIE = "mm_pat" as const;
const TOKEN_QUERY_PARAM = "token" as const;

// Allowed origins for CORS - configurable via env
function getAllowedOrigins(): string[] {
  const defaultOrigins: (string | undefined)[] = [
    "https://ecency.com",
    "http://localhost:3000",
    "http://localhost:3001",
    process.env.NEXT_PUBLIC_APP_BASE
  ];

  if (process.env.MATTERMOST_WS_ALLOWED_ORIGINS) {
    const customOrigins = process.env.MATTERMOST_WS_ALLOWED_ORIGINS
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
    return [...defaultOrigins, ...customOrigins].filter((o): o is string => Boolean(o));
  }

  return defaultOrigins.filter((o): o is string => Boolean(o));
}

const ALLOWED_ORIGINS = getAllowedOrigins();

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

function getMattermostWebsocketUrl(): string {
  const base = requireEnv(process.env.MATTERMOST_BASE_URL, "MATTERMOST_BASE_URL");
  const baseUrl = new URL(base);
  baseUrl.protocol = baseUrl.protocol === "https:" ? "wss:" : "ws:";
  baseUrl.pathname = `${baseUrl.pathname.replace(/\/$/, "")}/websocket`;
  return baseUrl.toString();
}

function buildAuthenticationChallenge(token: string): string {
  return JSON.stringify({
    seq: 1,
    action: "authentication_challenge",
    data: { token }
  });
}

function getToken(request: NextRequest): string | undefined {
  // Check Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice("bearer ".length).trim();
  }

  // Check query parameter
  const queryToken = request.nextUrl.searchParams.get(TOKEN_QUERY_PARAM);
  if (queryToken) {
    return queryToken;
  }

  // Check cookie
  return request.cookies.get(MATTERMOST_TOKEN_COOKIE)?.value;
}

function checkOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  if (!origin) {
    // Same-origin requests don't have Origin header
    return true;
  }

  return ALLOWED_ORIGINS.includes(origin);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  return new Response("WebSocket endpoint. Use a WebSocket client to connect.", {
    status: 426,
    headers: { Upgrade: "websocket" }
  });
}

export function UPGRADE(
  client: WebSocket,
  _server: WebSocketServer,
  request: NextRequest
): void {
  const requestOrigin = request.headers.get("origin") || "none";
  const requestHost = request.headers.get("host") || "unknown";

  // Check origin for CORS
  if (!checkOrigin(request)) {
    console.warn("Chat WebSocket: origin blocked", { origin: requestOrigin, host: requestHost });
    client.close(1008, "Origin not allowed");
    return;
  }

  // Get authentication token
  const token = getToken(request);
  if (!token) {
    console.warn("Chat WebSocket: missing token", { origin: requestOrigin, host: requestHost });
    client.close(1008, "Unauthorized");
    return;
  }

  // Connect to upstream Mattermost WebSocket
  let upstream: WebSocket;
  let connectionTimeout: NodeJS.Timeout;
  let pingInterval: NodeJS.Timeout | null = null;
  let isAuthenticated = false;

  try {
    const mattermostWsUrl = getMattermostWebsocketUrl();
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_APP_BASE || "https://ecency.com";

    console.info("Chat WebSocket: connecting upstream", {
      origin,
      host: requestHost,
      upstream: mattermostWsUrl,
      tokenPresent: true
    });

    upstream = new WebSocket(mattermostWsUrl, {
      headers: {
        "Origin": origin,
        "User-Agent": "Ecency-WebSocket-Proxy/1.0"
      },
      // Increase handshake timeout to handle network latency
      handshakeTimeout: 30000, // 30 seconds
    });

    // Set connection timeout - generous timeout to handle slow networks and auth
    connectionTimeout = setTimeout(() => {
      if (upstream.readyState !== WebSocket.OPEN) {
        console.error("Chat WebSocket: upstream connection timeout");
        upstream.terminate();
        client.close(1011, "Upstream connection timeout");
      }
    }, 45000); // 45 seconds total timeout (allows time for connection + auth)
  } catch (error) {
    console.error("Chat WebSocket: failed to connect upstream", error);
    client.close(1011, "Chat service unavailable");
    return;
  }

  const closeBoth = (code = 1011, reason = "websocket error") => {
    // Clear all timers
    clearTimeout(connectionTimeout);
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }

    try {
      client.close(code, reason);
    } catch (error) {
      console.error("MM websocket: failed closing downstream", error);
    }

    try {
      upstream.close(code, reason);
    } catch (error) {
      console.error("MM websocket: failed closing upstream", error);
    }
  };

  // Client -> Upstream forwarding
  client.on("message", (data, isBinary) => {
    try {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.send(data, { binary: isBinary });
      }
    } catch (error) {
      closeBoth(1011, "forward error");
    }
  });

  client.on("close", (code, reason) => {
    try {
      if (upstream.readyState === WebSocket.OPEN) {
        upstream.close(code, reason);
      }
    } catch (error) {
      // Silent - connection already closing
    }
  });

  client.on("error", () => {
    console.error("Chat WebSocket: client error");
    closeBoth(1011, "client error");
  });

  // Upstream -> Client forwarding
  upstream.on("open", () => {
    // Clear connection timeout
    clearTimeout(connectionTimeout);

    console.info("Chat WebSocket: upstream connected, sending auth challenge");

    try {
      // Send authentication challenge
      upstream.send(buildAuthenticationChallenge(token));

      // Note: Ping interval will start after receiving "hello" event (in message handler)
      // This ensures we only ping after successful authentication
    } catch (error) {
      console.error("Chat WebSocket: auth challenge failed", error);
      closeBoth(1011, "auth error");
    }
  });

  // Handle pong responses
  upstream.on("pong", () => {
    // Pong received, connection is alive
  });

  upstream.on("message", (data, isBinary) => {
    try {
      // Check for Mattermost "hello" event to confirm authentication
      if (!isAuthenticated && !isBinary) {
        try {
          const message = JSON.parse(data.toString());
          if (message.event === "hello") {
            isAuthenticated = true;
            console.info("Chat WebSocket: authenticated successfully");

            // Now that we're authenticated, start keepalive pings
            if (!pingInterval) {
              pingInterval = setInterval(() => {
                if (upstream.readyState === WebSocket.OPEN) {
                  try {
                    upstream.ping();
                  } catch (error) {
                    console.error("Chat WebSocket: failed to send ping", error);
                    closeBoth(1011, "ping failed");
                  }
                } else {
                  if (pingInterval) {
                    clearInterval(pingInterval);
                    pingInterval = null;
                  }
                }
              }, 30000); // 30 seconds
            }
          }
        } catch {
          // Not JSON or not a hello event, just forward it
        }
      }

      if (client.readyState === WebSocket.OPEN) {
        if (isBinary) {
          client.send(data, { binary: true });
        } else {
          const text = data.toString();
          const scrubbed = scrubChatSocketFrame(text);
          client.send(scrubbed === text ? data : scrubbed, { binary: false });
        }
      }
    } catch (error) {
      console.error("Chat WebSocket: message forward failed", error);
      closeBoth(1011, "forward error");
    }
  });

  upstream.on("close", (code, reason) => {
    console.warn("Chat WebSocket: upstream closed", {
      code,
      reason: reason?.toString?.() || ""
    });
    try {
      if (client.readyState === WebSocket.OPEN) {
        client.close(code, reason);
      }
    } catch (error) {
      console.error("Chat WebSocket: close failed", error);
    }
  });

  upstream.on("error", (error) => {
    console.error("Chat WebSocket: upstream error", error);
    closeBoth(1011, "upstream error");
  });
}
