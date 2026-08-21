import i18next from "i18next";
import { articleSvg } from "@/assets/img/svg";
import { FormControl } from "@ui/input";
import React, { useEffect, useState } from "react";
import { faqKeysGeneral } from "@/consts";
import data from "@/features/ecency-center/data/path.json";
import useMount from "react-use/lib/useMount";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useFaqTranslations } from "@/features/i18n/use-faq-translations";

export function CenterFaq() {
  const pathname = usePathname();
  // FAQ articles load on demand (#1598); search and titles wait for them.
  const faqReady = useFaqTranslations();

  const [searchText, setSearchText] = useState("");
  const [faqKeys, setFaqKeys] = useState<string[]>([]);
  const [defaultFaqKeys, setDefaultFaqKeys] = useState<string[]>([]);
  const [datatoShow, setDatatoShow] = useState<string[]>([]);

  useEffect(() => {
    if (!searchText || !faqReady) {
      setDatatoShow(defaultFaqKeys);
      return;
    }

    let finalArray = Array.from(new Set(defaultFaqKeys.concat(faqKeys)));
    let searchResult: string[] = [];
    finalArray.map((x) => {
      const isSearchValid = i18next
        .t(`static.faq.${x}-body`)
        .toLocaleLowerCase()
        .includes(searchText.toLocaleLowerCase());
      if (isSearchValid) {
        searchResult.push(x);
      }
    });

    setDatatoShow(searchResult);
  }, [defaultFaqKeys, faqKeys, searchText, faqReady]);

  useMount(() => {
    const faqKeys = [...faqKeysGeneral];
    setFaqKeys(faqKeys);
    for (const p of data.faqPaths) {
      if (pathname?.match(p.path)) {
        setDefaultFaqKeys(p.suggestions);
        setDatatoShow(p.suggestions);
      }
    }
  });

  return (
    <div className="p-4">
      <div className="mb-3 search-bar w-full">
        <FormControl
          type="text"
          placeholder={i18next.t("floating-faq.search-placeholder")}
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
          }}
        />
      </div>
      <div className="flex flex-col max-h-[50dvh] overflow-y-auto gap-4">
        {!searchText ? (
          <p className="text-sm font-semibold opacity-50">{i18next.t("floating-faq.suggestion")}</p>
        ) : !datatoShow.length ? (
          <p className="text-sm font-semibold opacity-50">{i18next.t("floating-faq.no-results")}</p>
        ) : (
          ""
        )}
        {faqReady && datatoShow.map((x, i) => (
          <div
            className="animate-fade-in-up"
            style={{ animationDelay: `${Math.min(i, 5) * 50}ms` }}
            key={x}
          >
            <Link
              className="flex items-center p-3 gap-3 bg-gray-100 text-sm dark:bg-gray-900 rounded-2xl after:!content-none"
              href={`/faq#${x}`}
              target="_blank"
            >
              <div className="faq-image">{articleSvg}</div>
              {i18next.t(`static.faq.${x}-header`)}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
