import { describe, expect, it, vi } from "vitest";

// The real one probes each URL over the network, which never resolves under jsdom.
vi.mock("@/features/entry-management/entry-metadata-manager/get-dimensions-from-data-url", () => ({
  getDimensionsFromDataUrl: vi.fn(async (url: string) => `ratio:${url}`)
}));

import { EntryMetadataBuilder } from "@/features/entry-management/entry-metadata-manager/entry-metadata-builder";
import type { Entry } from "@/entities";

const COVER = "https://i.ecency.com/DQmX/cover.png";

const legacyEntry = (json_metadata: unknown) => ({ json_metadata }) as unknown as Entry;

/**
 * The edit save path is `.extend(entry)...withSelectedThumbnail(selected)`, which copies
 * json_metadata verbatim and then spreads its `image`. json_metadata is whatever the
 * publishing client wrote, and a 2022 Liketu post in production carries bare strings in
 * fields declared as lists (Sentry ECENCY-NEXT-1GQM came from one of them).
 */
describe("EntryMetadataBuilder on legacy metadata shapes", () => {
  it("does not publish one image entry per character of a bare-string image", async () => {
    const builder = await new EntryMetadataBuilder()
      .extend(legacyEntry({ image: COVER }))
      .withSelectedThumbnail(COVER);

    expect(builder.build().image).toEqual([COVER]);
  });

  it("keeps a bare-string image when no thumbnail was chosen", async () => {
    const builder = await new EntryMetadataBuilder()
      .extend(legacyEntry({ image: COVER }))
      .withSelectedThumbnail(undefined);

    expect(builder.build().image).toEqual([COVER]);
  });

  it("stays saveable when image is a shape that cannot be spread", async () => {
    // `[...(image ?? [])]` threw "is not iterable" here, so the edit could not be saved.
    for (const image of [7, { 0: COVER }, null]) {
      const builder = await new EntryMetadataBuilder()
        .extend(legacyEntry({ image }))
        .withSelectedThumbnail(COVER);

      expect(builder.build().image).toEqual([COVER]);
    }
  });

  it("drops junk entries rather than publishing them back", async () => {
    const builder = await new EntryMetadataBuilder()
      .extend(legacyEntry({ image: [COVER, null, 7, ""] }))
      .withSelectedThumbnail(undefined);

    expect(builder.build().image).toEqual([COVER]);
  });

  it("rewrites a malformed thumbnails field it is not replacing", async () => {
    const builder = await new EntryMetadataBuilder()
      .extend(legacyEntry({ image: [COVER], thumbnails: COVER }))
      .withSelectedThumbnail(undefined);

    expect(builder.build().thumbnails).toEqual([COVER]);
  });

  it("computes one image_ratios entry per real image, never per character", async () => {
    const builder = await new EntryMetadataBuilder()
      .extend(legacyEntry({ image: COVER }))
      .withSelectedThumbnail(COVER);

    expect(builder.build().image_ratios).toHaveLength(1);
  });

  it("leaves well-formed metadata exactly as it was", async () => {
    const images = [COVER, "https://i.ecency.com/DQmY/second.png"];
    const builder = await new EntryMetadataBuilder()
      .extend(legacyEntry({ image: images, thumbnails: [COVER] }))
      .withSelectedThumbnail(COVER);

    expect(builder.build().image).toEqual(images);
    expect(builder.build().thumbnails).toEqual([COVER]);
  });
});
