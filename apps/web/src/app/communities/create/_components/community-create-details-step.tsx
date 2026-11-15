import { LoginRequired } from "@/features/shared";
import { Button, FormControl } from "@/features/ui";
import { handleInvalid } from "@/utils";
import i18next from "i18next";
import { CommunityCreateCardLayout } from "./community-create-card-layout";
import { CommunityTypes } from "@/enums";
import Link from "next/link";

const COMMUNITY_TYPES_OPTIONS = [
  {
    label: i18next.t("communities-create.topic"),
    value: CommunityTypes.Topic
  },
  {
    label: i18next.t("communities-create.journal"),
    value: CommunityTypes.Journal
  },
  {
    label: i18next.t("communities-create.council"),
    value: CommunityTypes.Council
  }
];

interface Props {
  title: string;
  setTitle: (title: string) => void;
  about: string;
  setAbout: (about: string) => void;
  communityType: CommunityTypes;
  setCommunityType: (value: CommunityTypes) => void;
  onContinue: () => void;
}

export function CommunityCreateDetailsStep({
  title,
  setTitle,
  about,
  setAbout,
  communityType,
  setCommunityType,
  onContinue
}: Props) {
  return (
    <CommunityCreateCardLayout>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 lg:gap-6">
        <div className="col-span-1">
          <FormControl
            type="text"
            autoComplete="off"
            autoFocus={true}
            value={title}
            minLength={3}
            maxLength={20}
            onChange={(e) => setTitle(e.target.value)}
            required={true}
            onInvalid={(e: any) => handleInvalid(e, "communities-create.", "title-validation")}
            onInput={(e: any) => e.target.setCustomValidity("")}
            name="title"
            // Not while empty: an untouched field is not an error (#2075).
            aria-invalid={title !== "" && (title.length <= 2 || title.length >= 21)}
            placeholder={i18next.t("communities-create.title")}
          />
        </div>

        <div className="col-span-1">
          <FormControl
            type="select"
            value={communityType}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setCommunityType(e.target.value as CommunityTypes)
            }
            name="type"
          >
            {COMMUNITY_TYPES_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </FormControl>
        </div>

        <div className="col-span-2">
          <FormControl
            type="text"
            autoComplete="off"
            value={about}
            maxLength={120}
            onChange={(e) => setAbout(e.target.value)}
            name="about"
            placeholder={i18next.t("communities-create.about")}
          />
        </div>
      </div>

      <div className="flex justify-between items-center">
        <Link target="_blank" className="text-sm" href="https://docs.ecency.com/hive/communities/#types-of-communities">
          {i18next.t("communities-create.types-hint")}
        </Link>
        <LoginRequired>
          <Button disabled={!title} onClick={() => !!title && onContinue()}>
            {i18next.t("g.continue")}
          </Button>
        </LoginRequired>
      </div>
    </CommunityCreateCardLayout>
  );
}
