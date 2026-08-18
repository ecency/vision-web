import { Button } from "@/features/ui";
import { UilCheckCircle, UilClock } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getQuestsQueryOptions } from "@ecency/sdk";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { deriveQuestChipState } from "@/features/shared/quest-streak-chip/derive-quest-chip-state";
import {
  makeShareUrlReddit,
  makeShareUrlTwitter,
  makeShareUrlFacebook,
  makeShareUrlLinkedin,
  makeShareUrlDiscord
} from "@/utils/url-share";
import { facebookSvg, discordSvg, linkedinSvg, redditSvg, twitterSvg } from "@ui/svg";
import { FirstPublishDigestPrompt } from "@/features/newsletter";

interface EntryInfo {
  title: string;
  author: string;
  permlink: string;
  category: string;
}

interface Props {
  step: "published" | "scheduled";
  setEditStep: () => void;
  entryInfo?: EntryInfo;
}

const SHARE_BUTTONS = [
  { id: "twitter", icon: twitterSvg, label: "Twitter", makeFn: makeShareUrlTwitter },
  { id: "reddit", icon: redditSvg, label: "Reddit", makeFn: makeShareUrlReddit },
  { id: "facebook", icon: facebookSvg, label: "Facebook", makeFn: makeShareUrlFacebook },
  { id: "linkedin", icon: linkedinSvg, label: "LinkedIn", makeFn: makeShareUrlLinkedin },
  { id: "discord", icon: discordSvg, label: "Discord", makeFn: makeShareUrlDiscord }
] as const;

function ShareBar({ entryInfo }: { entryInfo: EntryInfo }) {
  const { category, author, permlink, title } = entryInfo;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-sm opacity-50">
        {i18next.t("publish.share-your-post", { defaultValue: "Share your post" })}
      </div>
      <div className="flex items-center gap-3">
        {SHARE_BUTTONS.map(({ id, icon, label, makeFn }) => {
          const needsTitle = makeFn.length === 4;
          const url = needsTitle
            ? (makeFn as typeof makeShareUrlTwitter)(category, author, permlink, title)
            : (makeFn as typeof makeShareUrlFacebook)(category, author, permlink);

          return (
            <a
              key={id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              title={label}
              data-icon-exempt="brand-marks"
              className="text-blue-dark-sky hover:opacity-70 transition-opacity [&_svg]:size-7"
            >
              {icon}
            </a>
          );
        })}
      </div>
    </div>
  );
}

/**
 * One-line quest celebration under the success message. Renders whenever the
 * quests query reports the daily post quest complete: instantly from cache
 * for a repeat post, or after the post-publish refresh for the first post of
 * the day.
 */
function QuestCompleteLine() {
  const { activeUser } = useActiveAccount();
  const { data: quests } = useQuery(getQuestsQueryOptions(activeUser?.username));

  const state = deriveQuestChipState(quests);

  if (!state?.postedToday) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 text-sm font-semibold text-green">
      <span aria-hidden>🔥</span>
      <span>
        {i18next.t("quest-chip.post-quest-complete")}
        {state.streak > 0 && <> · {i18next.t("perks.quests.streak", { n: state.streak })}</>}
      </span>
    </div>
  );
}

export function PublishSuccessState({ step, setEditStep, entryInfo }: Props) {
  const { activeUser } = useActiveAccount();
  const profileHref = activeUser ? `/@${activeUser.username}/posts` : "/";

  return (
    <div className="animate-fade-in-up container mx-auto max-w-[800px] py-4 sm:py-6 md:py-8 lg:py-10 xl:py-16">
      <div className="px-2 py-4 sm:px-4 md:p-6 lg:p-12 bg-white rounded-2xl flex flex-col gap-4 md:gap-8 lg:gap-12 xl:gap-16 items-center">
        <div className="flex flex-col items-center justify-center gap-2">
          {step === "published" && <UilCheckCircle className="text-green size-12" />}
          {step === "scheduled" && <UilClock className="text-blue-dark-sky size-12" />}
          <div className="text-xl font-bold">
            {step === "published" && i18next.t("publish.published-title")}
            {step === "scheduled" && i18next.t("publish.scheduled-title")}
          </div>
          <div className="text-gray-600 dark:text-gray-400 text-center max-w-[500px]">
            {step === "published" && i18next.t("publish.published-hint")}
            {step === "scheduled" && i18next.t("publish.scheduled-hint")}
          </div>
        </div>

        {step === "published" && <QuestCompleteLine />}

        {step === "published" && entryInfo && <ShareBar entryInfo={entryInfo} />}

        {step === "published" && <FirstPublishDigestPrompt />}

        <div className="flex items-center gap-4">
          <Link href="/publish">
            <Button appearance="gray" size="sm" onClick={() => setEditStep()}>
              {i18next.t("publish.back-to-editor")}
            </Button>
          </Link>
          <Link href={profileHref}>
            <Button size="sm">{i18next.t("publish.go-to-posts")}</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
