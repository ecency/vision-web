import i18next from "i18next";
import { langOptions } from "@/features/i18n";
import { NavigationLocaleWatcherClient } from "@/features/i18n/navigation-locale-watcher-client";

interface Props {
  searchParams: Record<string, string | undefined>;
}

export async function NavigationLocaleWatcher({ searchParams }: Props) {
  const languageFromList = langOptions.find(
    (item) => item.code.split("-")[0] === searchParams["lang"]
  );
  const nextLanguage = languageFromList?.code;

  if (nextLanguage) {
    await i18next.changeLanguage(nextLanguage);
  }

  return <NavigationLocaleWatcherClient targetLanguage={nextLanguage} />;
}
