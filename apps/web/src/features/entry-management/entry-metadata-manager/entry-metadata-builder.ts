import { postBodySummary, proxifyImageSrc } from "@ecency/render-helper";
import { PollSnapshot } from "../../polls";
import appPackage from "../../../../package.json";
import { getDimensionsFromDataUrl } from "./get-dimensions-from-data-url";
import { extractMetaData, makeApp, metaStringList } from "@/utils/posting";
import { makeEntryPath } from "@/utils/make-path";
import { AiToolsMeta, Entry, MetaData } from "@/entities";
import { DECENTMEMES_METADATA_VERSION } from "@/api/decentmemes";

const DEFAULT_TAGS = ["ecency"];

const DEFAULT_METADATA = {
  app: makeApp(appPackage.version),
  tags: [...DEFAULT_TAGS],
  format: "markdown+html"
};

export class EntryMetadataBuilder {
  private temporaryMetadata: MetaData = {};

  public extend(entry?: Entry): this {
    this.temporaryMetadata = {
      ...entry?.json_metadata
    };
    return this;
  }

  public default(): this {
    this.temporaryMetadata = {
      ...DEFAULT_METADATA
    };
    return this;
  }

  public extractFromBody(body: string): this {
    const meta = extractMetaData(body);
    this.temporaryMetadata = {
      ...this.temporaryMetadata,
      ...meta
    };
    return this;
  }

  public withPinnedReply(reply: Entry, pinned: boolean): this {
    return this.withField("pinned_reply", pinned ? `${reply.author}/${reply.permlink}` : undefined);
  }

  public withSummary(bodyOrDescription: string): this {
    return this.withField("description", postBodySummary(bodyOrDescription, 200));
  }

  public withTags(tags?: string[]): this {
    const finalTags = tags && tags.length > 0 ? tags : DEFAULT_TAGS;
    return this.withField("tags", finalTags);
  }

  public withPostLinks(entries: Entry[] = []): this {
    return this.withField(
      "links",
      entries
        .filter((e) => !!e)
        .map(
          (entry) =>
            `https://ecency.com${makeEntryPath(entry.category, entry.author, entry.permlink)}`
        )
    ).withField(
      "links_meta",
      entries.reduce(
        (acc, entry) => {
          if (!entry) {
            return acc;
          }

          return {
            ...acc,
            [`https://ecency.com${makeEntryPath(entry.category, entry.author, entry.permlink)}`]: {
              title: entry.title,
              summary: entry.json_metadata?.description,
              image: entry.json_metadata?.image
            }
          };
        },
        {}
      )
    );
  }

  public async withSelectedThumbnail(
    selectedThumbnail: string | undefined,
    images?: string[]
  ): Promise<this> {
    const { image, thumbnails } = this.temporaryMetadata;

    // `extend(entry)` copies json_metadata verbatim, so `image` is whatever the
    // publishing client wrote. Spreading it directly is how a legacy post whose
    // `image` is one bare URL string gets published back as one entry PER
    // CHARACTER, with an image_ratios probe for each, and how a numeric or object
    // value throws "is not iterable" and makes the edit unsaveable.
    let nextImages = [...(images ?? []), ...metaStringList(image)];

    if (selectedThumbnail) {
      nextImages.unshift(selectedThumbnail);
      this.withField("thumbnails", [selectedThumbnail]);
    } else if (thumbnails !== undefined) {
      // Nothing new to set, so the copied value is what would be published. Write
      // the list it was meant to be rather than the shape it arrived in.
      this.withField("thumbnails", metaStringList(thumbnails));
    }

    nextImages = Array.from(new Set(nextImages)).splice(0, 9);

    this.withField("image", nextImages);
    this.withField(
      "image_ratios",
      await Promise.all(
        nextImages
          .slice(0, 5)
          .map((element: string) => getDimensionsFromDataUrl(proxifyImageSrc(element)))
      )
    );
    return this;
  }

  public withPoll(poll?: PollSnapshot): this {
    this.temporaryMetadata = {
      ...this.temporaryMetadata,
      ...(poll
        ? {
            content_type: "poll",
            version: 1.1,
            question: poll.title,
            choices: poll.choices,
            preferred_interpretation: poll.interpretation,
            token: poll.interpretation === "tokens" ? "HIVE:HP" : null,
            hide_votes: poll.hideVotes,
            vote_change: poll.voteChange,
            max_choices_voted: poll.maxChoicesVoted || 1,
            filters: {
              account_age: poll.filters.accountAge
            },
            end_time: Math.round(
              poll.endTime instanceof Date ? poll.endTime.getTime() / 1000 : poll.endTime
            )
          }
        : {})
    } as MetaData;
    return this;
  }

  public withLocation(location?: { coordinates: { lat: number; lng: number }; address?: string }) {
    this.temporaryMetadata = {
      ...this.temporaryMetadata,
      ...(location && {
        location: {
          coordinates: {
            lat: +location.coordinates.lat.toFixed(3),
            lng: +location.coordinates.lng.toFixed(3)
          },
          address: location.address
        }
      })
    };

    return this;
  }

  public withDecentMemes(data?: { templateIds: string[]; frontend?: string }): this {
    if (!data || !data.templateIds || data.templateIds.length === 0) {
      return this;
    }
    return this.withField("decentmemes", {
      v: DECENTMEMES_METADATA_VERSION,
      templateIds: data.templateIds,
      ...(data.frontend ? { frontend: data.frontend } : {})
    });
  }

  // Optional AI-usage disclosure (`ai_tools`, interoperable with other Hive frontends). Only
  // writes truthy flags, and omits the object entirely when nothing was disclosed, so a
  // normal post is untouched.
  public withAiTools(aiTools?: AiToolsMeta): this {
    if (!aiTools) {
      return this;
    }
    const cleaned = Object.fromEntries(Object.entries(aiTools).filter(([, v]) => v === true));
    if (Object.keys(cleaned).length === 0) {
      return this;
    }
    return this.withField("ai_tools", cleaned);
  }

  public build(): MetaData {
    return { ...this.temporaryMetadata };
  }

  private withField(fieldName: keyof MetaData, value: MetaData[typeof fieldName]): this {
    this.temporaryMetadata[fieldName] = value;
    return this;
  }
}
