import { LoginRequired } from "@/features/shared";
import { Button } from "@/features/ui";
import { UilArrowRight } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Image from "next/image";
import { useFaqTranslations } from "@/features/i18n/use-faq-translations";

interface Props {
  onContinue: () => void;
}

export function PromotePostIntro({ onContinue }: Props) {
  // The explainer is a FAQ article, loaded on demand (#1598).
  const faqReady = useFaqTranslations();
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center text-gray-600 dark:text-gray-400 my-4 md:my-6 lg:my-8">
      <Image width={375} height={400} alt="" src="/assets/undraw-promote.svg" className="mx-auto" />
      <div className="flex flex-col gap-4 items-start">
        {faqReady && (
          <div
            dangerouslySetInnerHTML={{ __html: i18next.t("static.faq.how-promotion-work-body") }}
          />
        )}
        <LoginRequired>
          <Button size="lg" icon={<UilArrowRight />} onClick={onContinue}>
            {i18next.t("g.continue")}
          </Button>
        </LoginRequired>
      </div>
    </div>
  );
}
