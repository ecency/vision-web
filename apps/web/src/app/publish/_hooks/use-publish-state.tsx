import {
  SUBMIT_DESCRIPTION_MAX_LENGTH,
  SUBMIT_TAG_MAX_LENGTH,
  SUBMIT_TITLE_MAX_LENGTH
} from "@/app/submit/_consts";
import { hasThreeSpeakEmbed } from "@/api/threespeak-embed";
import { DecentMemesEntry } from "@/api/decentmemes";
import { AiToolsMeta, BeneficiaryRoute, Entry } from "@/entities";
import { extractMetaData } from "@/utils";
import dayjs from "@/utils/dayjs";
import { postBodySummary } from "@ecency/render-helper";
import i18next from "i18next";
import {
  createContext,
  Dispatch,
  SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import isEqual from "react-fast-compare";
import { usePublishPollState } from "./use-publish-poll-state";

interface PublishStateContextValue {
  title: string;
  content: string;
  setTitle: (value: string) => void;
  setContent: (value: string) => void;
  reward: string;
  setReward: (value: string) => void;
  beneficiaries: BeneficiaryRoute[];
  setBeneficiaries: Dispatch<SetStateAction<BeneficiaryRoute[]>>;
  metaDescription: string;
  setMetaDescription: (value: string) => void;
  schedule: Date | undefined;
  setSchedule: (value: Date | undefined) => void;
  clearSchedule: () => void;
  tags: string[];
  setTags: (value: string[]) => void;
  thumbnails: string[];
  selectedThumbnail: string;
  setSelectedThumbnail: (value: string) => void;
  clearAll: () => void;
  isReblogToCommunity: boolean;
  setIsReblogToCommunity: (value: boolean) => void;
  poll: any;
  setPoll: (value: any) => void;
  createDefaultPoll: () => void;
  postLinks: Entry[];
  setPostLinks: (value: Entry[]) => void;
  setEntryImages: Dispatch<SetStateAction<string[]>>;
  location:
    | {
        coordinates: { lng: number; lat: number };
        address?: string;
      }
    | undefined;
  setLocation: (
    value:
      | {
          coordinates: { lng: number; lat: number };
          address?: string;
        }
      | undefined
  ) => void;
  clearLocation: () => void;
  skipAutoThumbnailSelection: boolean;
  clearSelectedThumbnail: () => void;
  hasThreeSpeakVideo: boolean;
  decentMemes: DecentMemesEntry[];
  addDecentMemesResult: (entry: DecentMemesEntry) => void;
  setDecentMemes: (entries: DecentMemesEntry[]) => void;
  clearDecentMemes: () => void;
  aiTools: AiToolsMeta;
  setAiTools: Dispatch<SetStateAction<AiToolsMeta>>;
  clearAiTools: () => void;
  appliedTemplateBody: string | null;
  setAppliedTemplateBody: (value: string | null) => void;
  /**
   * Bumped by clearAll. Anything holding state derived from "the post that was
   * being written" - the autosave engine's draft binding above all - has to
   * drop it when this changes, or it stays bound to the previous post and
   * writes the next one over that post's draft.
   */
  clearGeneration: number;
}

const PublishStateContext = createContext<PublishStateContextValue | undefined>(undefined);

export function PublishStateProvider({ children }: { children: React.ReactNode }) {
  const [title, setStoredTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [reward, setReward] = useState<string>("default");
  const [beneficiaries, setBeneficiaries] = useState<BeneficiaryRoute[]>([]);
  const [metaDescription, setStoredMetaDescription] = useState<string>("");
  const [schedule, setSchedule] = useState<Date | undefined>(undefined);
  const [tags, setStoredTags] = useState<string[]>([]);
  const [selectedThumbnail, setSelectedThumbnail] = useState<string>("");
  const [skipAutoThumbnailSelection, setSkipAutoThumbnailSelection] = useState<boolean>(false);
  const [isReblogToCommunity, setIsReblogToCommunity] = useState<boolean>(false);
  const [postLinks, setPostLinks] = useState<Entry[]>([]);
  const [entryImages, setEntryImages] = useState<string[]>([]);
  const [location, setLocation] = useState<
    | {
        coordinates: { lng: number; lat: number };
        address?: string;
      }
    | undefined
  >(undefined);
  const hasThreeSpeakVideo = useMemo(() => hasThreeSpeakEmbed(content), [content]);
  const [poll, setPoll] = usePublishPollState(false);
  const [decentMemes, setDecentMemes] = useState<DecentMemesEntry[]>([]);
  const [aiTools, setAiTools] = useState<AiToolsMeta>({});
  const [appliedTemplateBody, setAppliedTemplateBody] = useState<string | null>(null);
  const [clearGeneration, setClearGeneration] = useState(0);

  const clearDecentMemes = useCallback(() => setDecentMemes([]), []);
  const clearAiTools = useCallback(() => setAiTools({}), []);

  // Track each meme added to the post, keyed by its hosted image URL. Dropping
  // memes whose image was removed, and capping against Hive limits, both happen
  // at publish time (collectPresentMemeAttribution + enforceDecentMemesBeneficiary).
  const addDecentMemesResult = useCallback((entry: DecentMemesEntry) => {
    setDecentMemes((prev) => [...prev.filter((m) => m.imageUrl !== entry.imageUrl), entry]);
  }, []);

  const clearSchedule = useCallback(() => setSchedule(undefined), []);
  const clearSelectedThumbnail = useCallback(() => setSelectedThumbnail(""), []);
  const clearPostLinks = useCallback(() => setPostLinks([]), []);
  const clearEntryImages = useCallback(() => setEntryImages([]), []);
  const clearLocation = useCallback(() => setLocation(undefined), []);
  const clearPoll = useCallback(() => setPoll(undefined), [setPoll]);

  const setTitle = useCallback(
    (value: string) => setStoredTitle(value.slice(0, SUBMIT_TITLE_MAX_LENGTH)),
    [setStoredTitle]
  );

  const setMetaDescription = useCallback(
    (value: string) => setStoredMetaDescription(value.slice(0, SUBMIT_DESCRIPTION_MAX_LENGTH)),
    [setStoredMetaDescription]
  );

  const sanitizeTags = useCallback((tagList: string[]) => {
    const trimmed = tagList.map((tag) => tag.slice(0, SUBMIT_TAG_MAX_LENGTH)).filter((tag) => tag);
    return Array.from(new Set(trimmed));
  }, []);

  const setTags = useCallback(
    (nextTags: string[]) => {
      setStoredTags(sanitizeTags(nextTags));
    },
    [sanitizeTags, setStoredTags]
  );

  useEffect(() => {
    if ((title?.length ?? 0) > SUBMIT_TITLE_MAX_LENGTH) {
      setTitle(title ?? "");
    }
  }, [setTitle, title]);

  useEffect(() => {
    if ((metaDescription?.length ?? 0) > SUBMIT_DESCRIPTION_MAX_LENGTH) {
      setMetaDescription(metaDescription ?? "");
    }
  }, [metaDescription, setMetaDescription]);

  useEffect(() => {
    const sanitized = sanitizeTags(tags ?? []);
    if (!isEqual(sanitized, tags)) {
      setStoredTags(sanitized);
    }
  }, [sanitizeTags, setStoredTags, tags]);

  const metadata = useMemo(() => {
    const initialImage = selectedThumbnail ? [selectedThumbnail] : [];
    const mergedImages = Array.from(new Set([...initialImage, ...(entryImages ?? [])]));

    return extractMetaData(content ?? "", {
      image: mergedImages,
      thumbnails: mergedImages
    });
  }, [content, selectedThumbnail, entryImages]);
  const thumbnails = useMemo(() => metadata.thumbnails ?? [], [metadata.thumbnails]);

  const createDefaultPoll = useCallback(
    () =>
      !poll &&
      setPoll({
        title: i18next.t("polls.default-title"),
        choices: [
          i18next.t("polls.choice-placeholder", { n: 1 }),
          i18next.t("polls.choice-placeholder", { n: 2 })
        ],
        voteChange: true,
        hideVotes: false,
        maxChoicesVoted: 1,
        filters: {
          accountAge: 1
        },
        endTime: dayjs().add(1, "day").toDate(),
        interpretation: "number_of_votes"
      }),
    [poll, setPoll]
  );

  useEffect(() => {
    if (!metaDescription) {
      setMetaDescription(postBodySummary(content!, SUBMIT_DESCRIPTION_MAX_LENGTH));
    }
  }, [content, metaDescription, setMetaDescription]);

  useEffect(() => {
    if (!selectedThumbnail && thumbnails.length && !skipAutoThumbnailSelection) {
      setSelectedThumbnail(thumbnails[0]);
    }
  }, [thumbnails, selectedThumbnail, skipAutoThumbnailSelection]);

  useEffect(() => {
    if (selectedThumbnail && skipAutoThumbnailSelection) {
      setSkipAutoThumbnailSelection(false);
    }
  }, [selectedThumbnail, skipAutoThumbnailSelection, setSkipAutoThumbnailSelection]);

  const _clearSelectedThumbnail = useCallback(() => {
    clearSelectedThumbnail();
    setSkipAutoThumbnailSelection(true);
  }, [clearSelectedThumbnail, setSkipAutoThumbnailSelection]);

  const clearAll = useCallback(() => {
    setTitle("");
    setContent("");
    setReward("default");
    setBeneficiaries([]);
    setMetaDescription("");
    clearSchedule();
    setTags([]);
    setSelectedThumbnail("");
    setSkipAutoThumbnailSelection(false);
    clearPoll();
    clearPostLinks();
    clearEntryImages();
    clearLocation();
    clearDecentMemes();
    clearAiTools();
    setAppliedTemplateBody(null);
    setIsReblogToCommunity(false);
    setClearGeneration((generation) => generation + 1);
  }, [
    setBeneficiaries,
    setContent,
    setMetaDescription,
    setReward,
    clearSchedule,
    setTags,
    setTitle,
    setSelectedThumbnail,
    setSkipAutoThumbnailSelection,
    clearPoll,
    clearPostLinks,
    clearEntryImages,
    clearLocation,
    clearDecentMemes,
    clearAiTools,
    setAppliedTemplateBody,
    setIsReblogToCommunity
  ]);

  return (
    <PublishStateContext.Provider
      value={{
        title,
        content,
        setTitle,
        setContent,
        reward,
        setReward,
        beneficiaries,
        setBeneficiaries,
        metaDescription,
        setMetaDescription,
        schedule,
        setSchedule,
        clearSchedule,
        tags,
        setTags,
        thumbnails,
        selectedThumbnail,
        setSelectedThumbnail,
        clearAll,
        isReblogToCommunity,
        setIsReblogToCommunity,
        poll,
        setPoll,
        createDefaultPoll,
        postLinks,
        setPostLinks,
        setEntryImages,
        location,
        setLocation,
        clearLocation,
        skipAutoThumbnailSelection,
        clearSelectedThumbnail: _clearSelectedThumbnail,
        hasThreeSpeakVideo,
        decentMemes,
        addDecentMemesResult,
        setDecentMemes,
        clearDecentMemes,
        aiTools,
        setAiTools,
        clearAiTools,
        appliedTemplateBody,
        setAppliedTemplateBody,
        clearGeneration
      }}
    >
      {children}
    </PublishStateContext.Provider>
  );
}

export function usePublishState() {
  const context = useContext(PublishStateContext);
  if (context === undefined) {
    throw new Error("usePublishState must be used within a PublishStateProvider");
  }
  return context;
}
