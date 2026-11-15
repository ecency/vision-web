import { NextResponse } from "next/server";
import { clearMattermostTokenCookie } from "@/server/mattermost";

// Ends the browser's chat session on Ecency logout or account switch. Only the
// cookie goes: the personal access token behind it is shared with the account's
// other devices, so it is not revoked here.
export async function DELETE() {
  return clearMattermostTokenCookie(NextResponse.json({ ok: true }));
}
