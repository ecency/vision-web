import { Feedback } from "@/features/shared/feedback";
import { Navbar } from "@/features/shared/navbar";
import { ScrollToTop } from "@/features/shared/scroll-to-top";
import { Theme } from "@/features/shared/theme";
import { Metadata, ResolvingMetadata } from "next";
import i18next from "i18next";
import {
  FaqHeroImage,
  FaqSearchBar,
  FaqSearchBarResultInfo,
  FaqSearchListener
} from "@/app/(staticPages)/faq/_components";
import { searchWithinFaq } from "@/app/(staticPages)/faq/utils";
import { Tsx } from "@/features/i18n/helper";
import {
  NavigationLocaleWatcher,
  ensureFaqLoaded,
  getEnglishFaqResources,
  langOptions
} from "@/features/i18n";
import { FaqResources } from "@/features/i18n/faq-resources";
import { FaqSearchResult } from "@/app/(staticPages)/faq/_components/faq-search-result";
import { PagesMetadataGenerator } from "@/features/metadata";

export const revalidate = 86400; // 24 hours

export async function generateMetadata(
  props: unknown,
  parent: ResolvingMetadata
): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("faq");
}

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function FAQ({ searchParams }: Props) {
  const params = await searchParams;

  // The FAQ articles are not in the eager locale bundle (#1598). English is
  // the fallback for every article and the language client components hydrate
  // in, so it is always loaded and handed to them; a ?lang request (the same
  // resolution NavigationLocaleWatcher uses) also loads that whole locale.
  const requestedLang = langOptions.find(
    (item) => item.code.split("-")[0] === params["lang"]
  )?.code;
  await Promise.all([ensureFaqLoaded("en-US"), requestedLang && ensureFaqLoaded(requestedLang)]);
  const faqResources = getEnglishFaqResources();

  const searchResult = searchWithinFaq(params["q"] ?? "");

  return (
    <>
      <ScrollToTop />
      <Feedback />
      <Theme />
      <Navbar />
      <FaqResources resources={faqResources} />
      <FaqSearchListener searchResult={searchResult} />
      <NavigationLocaleWatcher searchParams={params} />

      <div
        className="app-content static-page faq-page"
        itemScope={true}
        itemType="https://schema.org/FAQPage"
      >
        <div className="static-content">
          <div className="relative rounded" style={{ marginBottom: "8%" }}>
            <FaqHeroImage />
            <div className="absolute search-container flex justify-center items-center flex-col rounded p-3">
              <h1 className="text-white faq-title text-center mb-3">
                {i18next.t("static.faq.page-title")}
              </h1>
              <FaqSearchBar />
              <FaqSearchBarResultInfo />
            </div>
          </div>
          <FaqSearchResult />

          <div className="faq-list">
            {searchResult.map((x) => {
              return (
                <div
                  key={x}
                  className="faq-item"
                  itemScope={true}
                  itemProp="mainEntity"
                  itemType="https://schema.org/Question"
                  id={x}
                >
                  <h4 className="faq-item-header text-[1.5rem] font-semibold" itemProp="name">
                    {i18next.t(`static.faq.${x}-header`)}
                  </h4>
                  <div
                    itemScope={true}
                    itemProp="acceptedAnswer"
                    itemType="https://schema.org/Answer"
                    id="content"
                  >
                    <Tsx k={`static.faq.${x}-body`}>
                      <div className="faq-item-body" itemProp="text" />
                    </Tsx>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
