import { useCallback } from "react";
// From the module, not the `@/core` barrel: the barrel imports the build-time
// `config.json`, which does not exist when tests run.
import type { RewardType } from "@/core/hive-layer";
import { resolveRewardType } from "@/core/hive-layer";
import { useSynchronizedLocalStorage } from "@/utils/use-synchronized-local-storage";

const STORAGE_KEY_PREFIX = "publish-draft";
const KEY_TITLE = `${STORAGE_KEY_PREFIX}-title`;
const KEY_BODY = `${STORAGE_KEY_PREFIX}-body`;
const KEY_TAGS = `${STORAGE_KEY_PREFIX}-tags`;
const KEY_REWARD_TYPE = `${STORAGE_KEY_PREFIX}-reward-type`;

const MAX_TITLE_LENGTH = 255;
const MAX_TAG_LENGTH = 24;

const defaultTitle = "";
const defaultBody = "";
const defaultTags: string[] = [];
/**
 * Nothing extra is broadcast unless the author says so, on every draft, every
 * time. A draft that has never been touched publishes exactly as this app
 * publishes today.
 */
const defaultRewardType: RewardType = "default";

export function usePublishState() {
  const [title, setTitle] = useSynchronizedLocalStorage<string>(
    KEY_TITLE,
    defaultTitle,
  );
  const [content, setContent] = useSynchronizedLocalStorage<string>(
    KEY_BODY,
    defaultBody,
  );
  const [tags, setTags] = useSynchronizedLocalStorage<string[]>(
    KEY_TAGS,
    defaultTags,
  );
  const [storedRewardType, setRewardType] = useSynchronizedLocalStorage<string>(
    KEY_REWARD_TYPE,
    defaultRewardType,
  );

  const setTitleState = useCallback(
    (value: string) => {
      setTitle(value.slice(0, MAX_TITLE_LENGTH));
    },
    [setTitle]
  );

  const setContentState = useCallback(
    (value: string) => {
      setContent(value);
    },
    [setContent]
  );

  const setTagsState = useCallback(
    (value: string[]) => {
      const sanitized = value
        .map((tag) => tag.slice(0, MAX_TAG_LENGTH).trim())
        .filter((tag) => tag.length > 0);
      setTags(Array.from(new Set(sanitized)));
    },
    [setTags]
  );

  const setRewardTypeState = useCallback(
    (value: RewardType) => {
      setRewardType(resolveRewardType(value));
    },
    [setRewardType]
  );

  const clearAll = useCallback(() => {
    setTitle(defaultTitle);
    setContent(defaultBody);
    setTags(defaultTags);
    // A reward choice belongs to the post it was made for. Carrying it into
    // the next post would decline rewards, or power them up, on something the
    // author never chose it for.
    setRewardType(defaultRewardType);
  }, [setTitle, setContent, setTags, setRewardType]);

  return {
    title,
    content,
    tags,
    // Normalised on the way out, not only on the way in: this value is read
    // back from localStorage, which is editable and outlives any one release.
    rewardType: resolveRewardType(storedRewardType),
    setTitleState,
    setContentState,
    setTagsState,
    setRewardTypeState,
    clearAll,
  };
}
