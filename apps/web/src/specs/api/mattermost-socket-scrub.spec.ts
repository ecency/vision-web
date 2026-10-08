import { describe, it, expect } from "vitest";
import { scrubChatSocketFrame } from "@/server/chat-public-user";

const user = {
  id: "u-2",
  username: "bob",
  props: { ecency_pat_sealed: "v1.x" },
  notify_props: { push: "all" },
  email: "bob@example.com"
};

describe("scrubChatSocketFrame", () => {
  it("strips private fields from user_updated events", () => {
    const out = JSON.parse(
      scrubChatSocketFrame(JSON.stringify({ event: "user_updated", data: { user }, seq: 4 }))
    );

    expect(out.seq).toBe(4);
    expect(out.data.user).toEqual({ id: "u-2", username: "bob" });
  });

  it("keeps a string-encoded user string-encoded", () => {
    const out = JSON.parse(
      scrubChatSocketFrame(
        JSON.stringify({ event: "user_updated", data: { user: JSON.stringify(user) } })
      )
    );

    expect(JSON.parse(out.data.user)).toEqual({ id: "u-2", username: "bob" });
  });

  it("passes every other frame through untouched", () => {
    const posted = JSON.stringify({ event: "posted", data: { post: '{"message":"user_updated"}' } });

    expect(scrubChatSocketFrame(posted)).toBe(posted);
    expect(scrubChatSocketFrame("not json")).toBe("not json");
    expect(scrubChatSocketFrame('{"event":"user_updated"')).toBe('{"event":"user_updated"');
  });

  it("strips private fields from thread participants, string-encoded or not", () => {
    const thread = { id: "t-1", reply_count: 2, participants: [user, { id: "u-3", username: "cy" }] };

    const encoded = JSON.parse(
      scrubChatSocketFrame(
        JSON.stringify({ event: "thread_updated", data: { thread: JSON.stringify(thread) } })
      )
    );
    const plain = JSON.parse(
      scrubChatSocketFrame(JSON.stringify({ event: "thread_updated", data: { thread } }))
    );

    for (const out of [JSON.parse(encoded.data.thread), plain.data.thread]) {
      expect(out.reply_count).toBe(2);
      expect(out.participants).toEqual([
        { id: "u-2", username: "bob" },
        { id: "u-3", username: "cy" }
      ]);
    }
  });

  it("leaves a thread without participants as it was", () => {
    const frame = JSON.stringify({ event: "thread_updated", data: { thread: '{"id":"t-1"}' } });

    expect(JSON.parse(JSON.parse(scrubChatSocketFrame(frame)).data.thread)).toEqual({ id: "t-1" });
  });
});
