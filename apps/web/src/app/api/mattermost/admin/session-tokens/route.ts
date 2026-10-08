import { NextResponse } from "next/server";
import {
  getMattermostTokenFromCookies,
  handleMattermostError,
  hasPlaintextSessionToken,
  listMattermostUsersWithPropsAsAdmin,
  requireMattermostSuperAdmin,
  retirePlaintextSessionToken
} from "@/server/mattermost";

export const maxDuration = 300;

const MAX_PER_PAGE = 200;
const CONCURRENCY = 8;

/**
 * Migrates stored session tokens from an older storage format, one page of
 * users per call. Users still on the old format get their issued tokens
 * revoked; a new token is issued on their next chat bootstrap.
 *
 * Body: `{ page?: number, perPage?: number }`. Call with increasing pages
 * until `done` (the last page was reached); users listed in `failed` are
 * picked up by running it again. Safe to re-run.
 */
export async function POST(req: Request) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const guard = await requireMattermostSuperAdmin(token);
    if (guard.response) {
      return guard.response;
    }

    let body: { page?: unknown; perPage?: unknown } = {};
    const raw = await req.text();
    if (raw) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: "malformed JSON body" }, { status: 400 });
      }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return NextResponse.json({ error: "body must be a JSON object" }, { status: 400 });
      }
      body = parsed as typeof body;
    }

    const page = body.page ?? 0;
    const perPage = body.perPage ?? MAX_PER_PAGE;
    if (!Number.isInteger(page) || (page as number) < 0) {
      return NextResponse.json({ error: "page must be a non-negative integer" }, { status: 400 });
    }
    if (!Number.isInteger(perPage) || (perPage as number) < 1 || (perPage as number) > MAX_PER_PAGE) {
      return NextResponse.json(
        { error: `perPage must be an integer between 1 and ${MAX_PER_PAGE}` },
        { status: 400 }
      );
    }

    const users = await listMattermostUsersWithPropsAsAdmin(page as number, perPage as number);
    // The caller's own token is migrated by their own next bootstrap, never
    // here: revoking it would end the session running this migration.
    const pending = users.filter(
      (user) => hasPlaintextSessionToken(user) && user.id !== guard.user.id
    );

    let migrated = 0;
    const failed: string[] = [];
    for (let i = 0; i < pending.length; i += CONCURRENCY) {
      const batch = pending.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((user) => retirePlaintextSessionToken(user.id))
      );
      results.forEach((result, j) => {
        if (result.status === "fulfilled") {
          if (result.value) migrated += 1;
        } else {
          failed.push(batch[j].username);
        }
      });
    }

    return NextResponse.json({
      page,
      scanned: users.length,
      migrated,
      failed,
      done: users.length < (perPage as number)
    });
  } catch (error) {
    return handleMattermostError(error);
  }
}
