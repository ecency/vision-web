import { NextResponse } from "next/server";

// Apple reads this from /.well-known/apple-app-site-association first and the
// site root second (next.config.js rewrites the former here). Its CDN keeps a
// copy and re-fetches on its own schedule, so a path added here reaches
// devices some time later.
export function GET() {
  return NextResponse.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "75B6RXTKGT.app.esteem.mobile.ios",
          paths: [
            "/@*",
            "/*/@*/*",
            "/hot/*",
            "/trending/*",
            "/created/*",
            "/hot",
            "/trending",
            "/created",
            // The waves feed, a wave, and the composer link the Honeyback game
            // and the web share cards open (/waves?text=...): without these the
            // app is never offered and the link lands in the browser.
            "/waves",
            "/waves/*",
            // Signup and purchase links the native app routes. /auth stays out:
            // it is also the web HiveSigner callback (/auth?code=...), and listing
            // it would hand a website login to the app.
            "/signup",
            "/signup/*",
            "/purchase",
            "/purchase/*",
            // The chats page and a chat channel (/chats/<channel id>), for the app
            // version that opens them (ecency/vision-mobile#3753). A community's
            // chat (/chats/<community>/channel) stays on the web: "*" matches
            // across "/", and Apple takes the first matching entry, so the NOT
            // entry has to come before "/chats/*".
            "/chats",
            "NOT /chats/*/channel",
            "/chats/*"
          ]
        }
      ]
    }
  });
}
