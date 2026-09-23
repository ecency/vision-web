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
            "/waves/*"
          ]
        }
      ]
    }
  });
}
