import { NextResponse } from "next/server";
import {
  getMattermostTokenFromCookies,
  handleMattermostError,
  MattermostUser,
  mmUserFetch
} from "@/server/mattermost";

// Who the chat session belongs to: the cookie can outlive an Ecency logout or
// account switch, so a page that posts for the user checks it first.
export async function GET() {
  const token = await getMattermostTokenFromCookies();
  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const user = await mmUserFetch<MattermostUser>(`/users/me`, token);
    return NextResponse.json({ username: user.username });
  } catch (error) {
    return handleMattermostError(error);
  }
}
