import { NextRequest, NextResponse } from "next/server";
import {
  getMattermostTokenFromCookies,
  handleMattermostError,
  mmUserFetch,
  MattermostUser
} from "@/server/mattermost";

interface MattermostPublicUser extends MattermostUser {
  first_name?: string;
  last_name?: string;
  nickname?: string;
  last_picture_update?: number;
}

const MAX_IDS = 200;

/**
 * Resolves chat user ids to public user records, for ids a client meets
 * outside a posts page (e.g. a reaction arriving over the websocket).
 * Body: `{ ids: string[] }`, answer `{ users: [] }` in the shape the mobile
 * client already reads. Unknown ids are simply absent from the result.
 */
export async function POST(req: NextRequest) {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const raw: unknown = body?.ids;

  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "ids must be an array of strings" }, { status: 400 });
  }

  // Bound the work before touching the elements; duplicates are tolerated
  // up to twice the cap, the deduplicated list is checked again below.
  if (raw.length > MAX_IDS * 2) {
    return NextResponse.json({ error: `at most ${MAX_IDS} ids per request` }, { status: 400 });
  }

  if (raw.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "ids must be an array of strings" }, { status: 400 });
  }

  const ids = Array.from(new Set((raw as string[]).map((id) => id.trim()).filter(Boolean)));

  if (ids.length > MAX_IDS) {
    return NextResponse.json({ error: `at most ${MAX_IDS} ids per request` }, { status: 400 });
  }

  if (!ids.length) {
    return NextResponse.json({ users: [] });
  }

  try {
    const users = await mmUserFetch<MattermostPublicUser[]>(`/users/ids`, token, {
      method: "POST",
      body: JSON.stringify(ids)
    });

    return NextResponse.json({
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        nickname: user.nickname,
        last_picture_update: user.last_picture_update
      }))
    });
  } catch (error) {
    return handleMattermostError(error);
  }
}
