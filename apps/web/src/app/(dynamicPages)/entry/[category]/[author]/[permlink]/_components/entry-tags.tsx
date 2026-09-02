import { TagLink } from "@/features/shared/tag";
import { FollowTagChipToggle } from "@/features/shared/follow-tag-btn";
import { Entry } from "@/entities";

interface Props {
  entry: Entry;
}

export function EntryTags({ entry }: Props) {
  const tags = Array.isArray(entry?.json_metadata?.tags)
    ? Array.from(new Set(entry.json_metadata?.tags)).filter(Boolean)
    : ["ecency"];

  return (
    <div className="entry-tags mb-4">
      {tags?.map((t, i) => {
        if (typeof t !== "string") {
          return <></>;
        }
        const isCommunityChip = !!entry.community && !!entry.community_title && t === entry.community;
        return (
          <TagLink
            key={t + i}
            tag={
              isCommunityChip
                ? {
                    name: entry.community!,
                    title: entry.community_title!
                  }
                : t.trim()
            }
            type="link"
          >
            <span className="inline-flex items-center">
              {t}
              {/* A community is subscribed to, not followed as a tag; the toggle
                  also hides itself for any value the follow rule refuses. */}
              {!isCommunityChip && <FollowTagChipToggle tag={t} />}
            </span>
          </TagLink>
        );
      })}
    </div>
  );
}
