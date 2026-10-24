import { describe, expect, it } from "vitest";
import {
  ASK_ESIE_HREF,
  impersonatesOfficialAccount,
  isOfficialChatAccount
} from "@/features/chat/official-accounts";
import { getUserDisplayName, isOfficialPostAuthor } from "@/features/chat/format-utils";
import type { MattermostPost, MattermostUser } from "@/features/chat/mattermost-api";

const user = (username: string, nickname = "") =>
  ({ id: `${username}-id`, username, nickname, first_name: "", last_name: "" }) as MattermostUser;

describe("official chat accounts", () => {
  it("are exactly esie and ecency", () => {
    expect(isOfficialChatAccount("esie")).toBe(true);
    expect(isOfficialChatAccount("@Ecency")).toBe(true);
    for (const name of ["esie1", "esie-help", "ecency.help", "", null, undefined]) {
      expect(isOfficialChatAccount(name)).toBe(false);
    }
    expect(ASK_ESIE_HREF).toBe("/chats?dm=esie");
  });

  it.each([
    "Esie", "ESIE support", "E-s-i-e", "E.s.i.e", "3sie", "E$ie", "Еsie", "Esıe", "Ɛsie", "Ecency Team",
    "Ecen¢y", "Εcency", "Eϲency", "Ecenсү", "e c e n c y", "Support: Esie", "EsieBot"
  ])(
    "treats the display name %j on another account as posing as an official one",
    (name) => {
      expect(impersonatesOfficialAccount(name, "scammer")).toBe(true);
    }
  );

  it.each([
    "Jessie", "Alice", "Desiree", "Ecosystem", "Agency", "Jane Siegel", "Jose Sierra", "Cassie Sievers",
    "Kate Sie", "Agnes Iem", "Mike 51e", "Decency", "Recency Bias", "Сергей", "王小明", "王小明華", "Δημήτρης", "2024"
  ])("leaves %j alone", (name) => {
    expect(impersonatesOfficialAccount(name, "someone")).toBe(false);
  });

  it("lets the official accounts use their own names", () => {
    expect(impersonatesOfficialAccount("Esie", "esie")).toBe(false);
    expect(impersonatesOfficialAccount("Ecency", "ecency")).toBe(false);
  });

  it("shows the @username for a lookalike name, wherever chat names someone", () => {
    expect(getUserDisplayName(user("scammer", "Esie Support"))).toBe("@scammer");
    expect(getUserDisplayName(user("esie", "Esie"))).toBe("Esie");
    expect(getUserDisplayName(user("alice", "Alice"))).toBe("Alice");
  });
});

describe("isOfficialPostAuthor", () => {
  const usersById = { "esie-id": user("esie"), "x-id": user("x") };
  const post = (fields: Partial<MattermostPost>) =>
    ({ id: "p", user_id: "esie-id", message: "hi", create_at: 1, type: "", props: {}, ...fields }) as MattermostPost;

  it("is true for a post by the official account's own chat user", () => {
    expect(isOfficialPostAuthor(post({}), usersById)).toBe(true);
  });

  it("never trusts a name carried in post props", () => {
    expect(isOfficialPostAuthor(post({ props: { override_username: "esie" } }), usersById)).toBe(false);
    expect(isOfficialPostAuthor(post({ props: { from_webhook: "true" } }), usersById)).toBe(false);
    expect(isOfficialPostAuthor(post({ user_id: "x-id", props: { username: "esie" } }), usersById)).toBe(false);
    expect(isOfficialPostAuthor(post({ user_id: "unknown" }), usersById)).toBe(false);
    expect(isOfficialPostAuthor(post({ type: "system_add_to_channel" }), usersById)).toBe(false);
  });
});
