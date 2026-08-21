import { Button } from "@/features/ui";
import { getPointsQueryOptions } from "@ecency/sdk";
import { useQuery } from "@tanstack/react-query";
import { UilArrowLeft, UilSpinner } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Link from "next/link";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { useFaqTranslations } from "@/features/i18n/use-faq-translations";

export function PointsBasicInfo() {
  const { activeUser } = useActiveAccount();
  // The explainer is a FAQ article, loaded on demand (#1598).
  const faqReady = useFaqTranslations();
  const { data: activeUserPoints, isPending } = useQuery(
    getPointsQueryOptions(activeUser?.username)
  );

  return (
    <div className="sm:col-span-2 lg:col-span-3 p-2 md:p-4 lg:p-6 bg-white rounded-xl w-full flex flex-col">
      <Link href="/perks">
        <Button
          size="sm"
          appearance="gray-link"
          icon={<UilArrowLeft />}
          iconPlacement="left"
          noPadding={true}
        >
          {i18next.t("g.back")}
        </Button>
      </Link>
      <h1 className="font-bold text-xl mt-2 md:mt-4 lg:mt-6">{i18next.t("perks.points-title")}</h1>
      <h2 className="opacity-50 mb-4">{i18next.t("perks.points-description")}</h2>
      {faqReady && (
        <p dangerouslySetInnerHTML={{ __html: i18next.t("static.faq.what-is-points-body") }} />
      )}

      <div className="flex items-center gap-2 mt-4">
        <div className="opacity-50">{i18next.t("redeem-common.balance")}:</div>
        <div className="text-blue-dark-sky">
          {isPending ? (
            <UilSpinner className="size-6 animate-spin" />
          ) : (
            (+(activeUserPoints?.points ?? "0")).toFixed(0) + " POINTS"
          )}
        </div>
      </div>
    </div>
  );
}
