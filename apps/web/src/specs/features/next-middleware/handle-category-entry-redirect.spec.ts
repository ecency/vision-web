import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { handleCategoryEntryRedirect } from "@/features/next-middleware";

function requestFor(rawPath: string) {
  return new NextRequest(`https://ecency.com${rawPath}`);
}

function locationOf(res: NextResponse) {
  return new URL(res.headers.get("location")!, "https://ecency.com");
}

describe("handleCategoryEntryRedirect", () => {
  it("308s a community-prefixed post URL onto the bare canonical", () => {
    const res = handleCategoryEntryRedirect(requestFor("/hive-125125/@good-karma/my-post"));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(308);
    expect(locationOf(res!).pathname).toBe("/@good-karma/my-post");
  });

  it("308s any legacy category prefix, not just hive-NNNNN", () => {
    const res = handleCategoryEntryRedirect(requestFor("/life/@alice/a-post"));
    expect(res).not.toBeNull();
    expect(locationOf(res!).pathname).toBe("/@alice/a-post");
  });

  // The whole point of the move: redirects() could not carry this header.
  it("emits a cacheable Cache-Control so the edge can serve the redirect", () => {
    const res = handleCategoryEntryRedirect(requestFor("/hive-125125/@good-karma/my-post"));
    const cc = res!.headers.get("cache-control")!;
    expect(cc).toContain("public");
    expect(cc).toMatch(/s-maxage=\d+/);
    expect(cc).not.toContain("no-store");
    expect(cc).not.toContain("private");
    // The CF worker only stores a response when s-maxage > 0.
    const sMaxAge = Number(cc.match(/s-maxage=(\d+)/)![1]);
    expect(sMaxAge).toBeGreaterThan(0);
  });

  it("labels the response with its own cache tier for origin-log observability", () => {
    const res = handleCategoryEntryRedirect(requestFor("/hive-125125/@good-karma/my-post"));
    expect(res!.headers.get("x-cache-tier")).toBe("entry-redirect");
  });

  it("preserves the query string, as the redirects() rule did", () => {
    const res = handleCategoryEntryRedirect(
      requestFor("/hive-125125/@good-karma/my-post?referral=bob")
    );
    const location = locationOf(res!);
    expect(location.pathname).toBe("/@good-karma/my-post");
    expect(location.searchParams.get("referral")).toBe("bob");
  });

  it("stays on-origin", () => {
    const res = handleCategoryEntryRedirect(requestFor("/hive-125125/@good-karma/my-post"));
    expect(locationOf(res!).host).toBe("ecency.com");
  });

  // 4-segment sub-paths kept their own rewrites and must not be swallowed here.
  it("ignores edit URLs and other sub-paths (4 segments)", () => {
    expect(handleCategoryEntryRedirect(requestFor("/hive-125125/@alice/a-post/edit"))).toBeNull();
    expect(
      handleCategoryEntryRedirect(requestFor("/hive-125125/@alice/a-post/comments"))
    ).toBeNull();
  });

  // The (?!@) guard on the category segment in the original rule.
  it("ignores paths whose first segment is itself an @author", () => {
    expect(handleCategoryEntryRedirect(requestFor("/@alice/@bob/a-post"))).toBeNull();
  });

  it("ignores the canonical entry URL itself, so there is no redirect loop", () => {
    expect(handleCategoryEntryRedirect(requestFor("/@alice/a-post"))).toBeNull();
  });

  it("ignores paths with no @author in the middle segment", () => {
    expect(handleCategoryEntryRedirect(requestFor("/trending/photography/foo"))).toBeNull();
    expect(handleCategoryEntryRedirect(requestFor("/hive-125125"))).toBeNull();
    expect(handleCategoryEntryRedirect(requestFor("/@alice"))).toBeNull();
  });
});
