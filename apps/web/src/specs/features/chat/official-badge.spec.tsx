import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { OfficialBadge } from "@/features/chat/components/official-badge";

describe("OfficialBadge", () => {
  it.each(["esie", "ecency", "@Esie"])("marks %s", (username) => {
    const { container } = render(<OfficialBadge username={username} />);
    expect(container.querySelector("[data-official-badge]")).toHaveTextContent("chat.official-badge");
  });

  it.each(["esie1", "ecency-support", "alice", undefined])("renders nothing for %s", (username) => {
    expect(render(<OfficialBadge username={username} />).container).toBeEmptyDOMElement();
  });

  // the card is too heavy to render here; this pins the badge to the account the page is about
  it("is on the profile card, for the profile's account", () => {
    const card = readFileSync(
      join(__dirname, "../../../app/(dynamicPages)/profile/[username]/_components/profile-card/index.tsx"),
      "utf8"
    );
    expect(card).toContain("<OfficialBadge username={account.name} />");
  });
});
