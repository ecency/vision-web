import "@testing-library/jest-dom";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommunityCard } from "@/app/(dynamicPages)/community/[community]/_components/community-card";
import { renderWithQueryClient } from "@/specs/test-utils";
import type { Account, Community } from "@/entities";

// The card's own sender tools, stubbed to identifiable text. What is under test
// is where the CARD puts them, not what they render.
vi.mock("@/features/newsletter", () => ({
  communityDigestRoles: () => ({ canView: true, canSend: true }),
  NewsletterGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SenderStatusNotice: () => <div>sender-status</div>,
  SubscriberCount: () => <div>0 email subscribers</div>,
  ComposeDigestButton: () => <div>Compose email digest</div>,
  SentIssues: () => <div>sent-issues</div>
}));

// Sections and dialogs are irrelevant to ordering and drag in editors/modals.
vi.mock(
  "@/app/(dynamicPages)/community/[community]/_components/community-card/community-card-description",
  () => ({ CommunityCardDescription: () => <div>description-section</div> })
);
vi.mock(
  "@/app/(dynamicPages)/community/[community]/_components/community-card/community-card-rules",
  () => ({ CommunityCardRules: () => <div>rules-section</div> })
);
vi.mock(
  "@/app/(dynamicPages)/community/[community]/_components/community-card/community-card-team",
  () => ({ CommunityCardTeam: () => <div>team-section</div> })
);
vi.mock("@/app/(dynamicPages)/community/[community]/_components/community-settings", () => ({
  CommunitySettingsDialog: () => null
}));
vi.mock(
  "@/app/(dynamicPages)/community/[community]/_components/community-rewards-registration",
  () => ({ CommunityRewardsRegistrationDialog: () => null })
);

const community = {
  name: "hive-125125",
  title: "Town Square",
  about: "The general community for Hive.",
  team: [],
  is_nsfw: false
} as unknown as Community;

const account = { name: "hive-125125", profile: {} } as unknown as Account;

/** True when `first` appears before `second` in document order. */
function precedes(first: HTMLElement, second: HTMLElement): boolean {
  return !!(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe("community card ordering", () => {
  it("opens with the community, not with the sender tools", () => {
    // The sidebar used to render the digest panel first, so a moderator landing
    // on the community saw "0 email subscribers" above the community's own
    // avatar and title. Identity comes first, the way the profile card does it.
    renderWithQueryClient(<CommunityCard community={community} account={account} />);

    const title = screen.getByText("Town Square");
    const about = screen.getByText("The general community for Hive.");
    const subscribers = screen.getByText("0 email subscribers");
    const compose = screen.getByText("Compose email digest");

    expect(precedes(title, subscribers)).toBe(true);
    expect(precedes(about, subscribers)).toBe(true);
    expect(precedes(title, compose)).toBe(true);
  });

  it("keeps the sender tools above the description sections", () => {
    renderWithQueryClient(<CommunityCard community={community} account={account} />);

    const subscribers = screen.getByText("0 email subscribers");
    const description = screen.getByText("description-section");

    expect(precedes(subscribers, description)).toBe(true);
  });
});
