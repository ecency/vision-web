import { NextRequest, NextResponse } from "next/server";
import { getMattermostTokenFromCookies, handleMattermostError, mmUserFetch } from "@/server/mattermost";

interface MattermostChannelMember {
  channel_id: string;
  user_id: string;
  roles: string;
  last_viewed_at: number;
  msg_count: number;
  mention_count: number;
  notify_props?: Record<string, string>;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = await params;
  const token = await getMattermostTokenFromCookies();

  if (!token) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const search = request.nextUrl.search || "";
    const members = await mmUserFetch<MattermostChannelMember[]>(
      `/channels/${encodeURIComponent(channelId)}/members${search}`,
      token
    );

    // Per-member notification settings are the member's own business.
    return NextResponse.json({
      members: members.map(({ notify_props: _notifyProps, ...member }) => member)
    });
  } catch (error) {
    return handleMattermostError(error);
  }
}
