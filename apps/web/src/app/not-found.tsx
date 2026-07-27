import i18next from "i18next";
import Image from "next/image";
import { initI18next } from "@/features/i18n";
import { Metadata, ResolvingMetadata } from "next";
import { PagesMetadataGenerator } from "@/features/metadata";
import { SentryIssueReporterDialog } from "@/features/issue-reporter";
import { Feedback } from "@/features/shared/feedback";
import defaults from "@/defaults";
import { NotFoundBackButton } from "./not-found-back-button";

export async function generateMetadata(
  props: unknown,
  parent: ResolvingMetadata
): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("not-found");
}

export default async function NotFoundPage() {
  await initI18next();

  return (
    <div
      className="bg-repeat"
      style={{
        backgroundSize: "200px",
        backgroundImage: `url(/assets/circle-pattern.svg)`
      }}
    >
      <Feedback />
      <div className="container mx-auto p-4 grid sm:grid-cols-2 gap-4 h-[100vh] items-center">
        <div className="flex flex-col justify-center gap-4 md:gap-8">
          <div className="flex gap-4">
            <Image src={defaults.logo} alt="logo" width={72} height={72} />
            <h1 className="text-8xl font-black text-blue-dark-sky">404</h1>
          </div>
          <h2 className="text-2xl font-semibold">{i18next.t("not-found.description")}</h2>
          <div className="flex items-center gap-4">
            <NotFoundBackButton fallbackHref="/">
              {i18next.t("not-found.back-home")}
            </NotFoundBackButton>
            <SentryIssueReporterDialog />
          </div>
        </div>
        {/* The page's main illustration and its LCP element — don't lazy-load it. */}
        <Image
          src="/assets/illustration-open-source.png"
          alt="logo"
          width={571}
          height={460}
          priority
        />
      </div>
    </div>
  );
}
