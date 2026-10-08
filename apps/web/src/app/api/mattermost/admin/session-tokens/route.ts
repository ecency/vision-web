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
 * until `done` is true. Safe to re-run.
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
      try {
        body = JSON.parse(raw);
      } catch {
        return NextResponse.json({ error: "malformed JSON body" }, { status: 400 });
      }
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
    const pending = users.filter(hasPlaintextSessionToken);

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
