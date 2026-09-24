import RSS from "rss";
import { getServerAppBase } from "@/utils/server-app-base";
import { isHiveNotFoundError } from "@/utils/hive-not-found-error";
import * as Sentry from "@sentry/nextjs";

export abstract class RssHandler<T> {
  protected abstract pathname: string;

  protected abstract fetchData(): Promise<T[]>;

  protected abstract convertItem(item: T, base: string): RSS.ItemOptions;

  /** Items a subclass wants left out of the feed entirely, not just rewritten. */
  protected includeItem(_item: T): boolean {
    return true;
  }

  async getFeed() {
    const base = await getServerAppBase();
    const feed = new RSS({
      title: "RSS Feed",
      feed_url: `${base}${this.pathname}`,
      site_url: base,
      image_url: `${base}/logo512.png`
    });

    try {
      const data = await this.fetchData();
      data
        .filter((item) => this.includeItem(item))
        .forEach((item) => feed.item(this.convertItem(item, base)));
    } catch (e) {
      if (!isTransientUpstreamError(e)) {
        Sentry.captureException(e, {
          extra: {
            pathname: this.pathname,
            handlerClass: this.constructor.name
          }
        });
      }
    }

    return feed;
  }
}

// Hive RPC and upstream HTTP layers regularly emit transient connection
// errors when crawlers fan out across many feed paths. They aren't bugs
// in our code, but capturing them drowns out real issues in Sentry.
export function isTransientUpstreamError(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const err = e as { name?: string; code?: string; message?: string };
  // undici / Node net layer
  if (err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "UND_ERR_SOCKET")
    return true;
  // AbortController- and Node fetch-timeout-induced errors. Also catches
  // the `Error: aborted` message undici raises on ECONNRESET, since that
  // error carries `name: "AbortError"`.
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;
  const msg = String(err.message ?? "");
  return (
    /Unable to parse endpoint data/i.test(msg) ||
    // Upstream 5xx, and 429 rate-limits: a crawler fanning out across many feed
    // paths trips the bridge/API rate limiter, which is a transient upstream
    // condition (not an app bug), so treat it like the other upstream failures.
    /HTTP (?:429|5\d\d)/.test(msg) ||
    /fetch failed/i.test(msg) ||
    // Hive's bridge rejects a missing tag, category or account with an assert
    // ("...Tag does not exist", "invalid tag `Foo`" for one that breaks the
    // format rules). Crawlers hit /:filter/:Tag/rss.xml with both.
    isHiveNotFoundError(e)
  );
}
