import { vi } from "vitest";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("@/utils/posting"))
}));

// jsdom never fires load/error on an Image, so the real helper's promise would
// hang forever. The ratio value itself is not what these tests are about.
vi.mock("@/features/entry-management/entry-metadata-manager/get-dimensions-from-data-url", () => ({
  getDimensionsFromDataUrl: () => Promise.resolve("1.7778")
}));

import { buildPublishOperation } from "@/app/publish/_utils/build-publish-operation";

const draft = {
  author: "spacecop",
  permlink: "who-the-dhf-has-actually-paid",
  title: "Who the DHF has actually paid",
  content: "A post about proposal payouts.\n\n![chart](https://images.ecency.com/chart.png)",
  tags: ["hive", "dhf"]
};

describe("buildPublishOperation", () => {
  it("returns the comment operation the broadcast sends", async () => {
    const { op } = await buildPublishOperation(draft);

    expect(op.author).toBe("spacecop");
    expect(op.permlink).toBe("who-the-dhf-has-actually-paid");
    expect(op.parent_author).toBe("");
    // The category is the first tag, as posted.
    expect(op.parent_permlink).toBe("hive");
    expect(op.title).toBe(draft.title);
  });

  /**
   * The reason this builder is shared with the RC pre-check: cost tracks
   * serialized size, and the real metadata is much larger than the tags-only
   * approximation the pre-check used to price.
   */
  it("carries the full metadata, not just tags", async () => {
    const { op } = await buildPublishOperation(draft);
    const meta = JSON.parse(op.json_metadata);

    expect(meta.tags).toEqual(["hive", "dhf"]);
    expect(meta.app).toContain("ecency");
    expect(meta.format).toBeDefined();
    expect(meta.description).toContain("proposal payouts");
    expect(meta.image).toContain("https://images.ecency.com/chart.png");
    expect(op.json_metadata.length).toBeGreaterThan(
      JSON.stringify({ tags: draft.tags }).length * 2
    );
  });

  it("prefers an author-written description over the generated summary", async () => {
    const { op, summary } = await buildPublishOperation({
      ...draft,
      metaDescription: "What the DHF paid, per account, 2019 to 2026."
    });

    expect(summary).toBe("What the DHF paid, per account, 2019 to 2026.");
    expect(JSON.parse(op.json_metadata).description).toContain("What the DHF paid");
  });

  it("keeps the author's beneficiaries", async () => {
    const { options, beneficiaries } = await buildPublishOperation({
      ...draft,
      beneficiaries: [{ account: "ecency", weight: 500 }]
    });

    expect(beneficiaries).toEqual([{ account: "ecency", weight: 500 }]);
    expect(options?.extensions?.[0]?.[1]?.beneficiaries).toEqual([
      { account: "ecency", weight: 500 }
    ]);
  });

  it("reports nothing dropped when there are no meme beneficiaries to merge", async () => {
    const { beneficiariesDropped } = await buildPublishOperation(draft);

    expect(beneficiariesDropped).toBe(false);
  });

  it("grows json_metadata with the body, which is what makes the estimate move", async () => {
    const small = await buildPublishOperation(draft);
    const large = await buildPublishOperation({
      ...draft,
      content:
        draft.content +
        "\n\n" +
        Array.from({ length: 30 }, (_, i) => `![i${i}](https://images.ecency.com/${i}.png)`).join(
          "\n"
        )
    });

    expect(large.op.json_metadata.length).toBeGreaterThan(small.op.json_metadata.length);
    expect(large.op.body.length).toBeGreaterThan(small.op.body.length);
  });
});
