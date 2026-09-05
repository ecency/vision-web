import i18next from "i18next";
import { Metadata } from "next";
import { initI18next } from "@/features/i18n";

export namespace PagesMetadataGenerator {
  function buildForAbout(): Metadata {
    return {
      title: i18next.t("static.about.page-title")
    };
  }

  function buildForChats(): Metadata {
    return {
      title: i18next.t("chat.page-title")
    };
  }

  function buildForCommunities(): Metadata {
    return {
      title: i18next.t("communities.title"),
      description: i18next.t("communities.description")
    };
  }

  function buildForCommunityCreate(): Metadata {
    return {
      title: i18next.t("communities-create.page-title"),
      description: i18next.t("communities-create.description")
    };
  }

  function buildForContributors(): Metadata {
    return {
      title: i18next.t("contributors.title")
    };
  }

  function buildForCreatorEconomy(): Metadata {
    return {
      title: i18next.t("creator-economy.page-title"),
      description: i18next.t("creator-economy.page-description")
    };
  }

  function buildForDecks(): Metadata {
    return {
      title: i18next.t("decks.title")
    };
  }

  function buildForDiscover(): Metadata {
    return {
      title: i18next.t("discover.title"),
      description: i18next.t("discover.description")
    };
  }

  function buildForCuration(): Metadata {
    return {
      title: i18next.t("curation-desk.page-title"),
      description: i18next.t("curation-desk.page-description")
    };
  }

  function buildForCurationGuide(): Metadata {
    return {
      title: i18next.t("curation-desk.guide.page-title"),
      description: i18next.t("curation-desk.guide.page-description")
    };
  }

  function buildForPublish(): Metadata {
    return {
      title: i18next.t("publish.get-started.title"),
      description: i18next.t("publish.get-started.posting-text")
    };
  }

  function buildForSubmit(): Metadata {
    return {
      title: i18next.t("submit.page-title"),
      description: i18next.t("submit.page-description")
    };
  }

  function buildForFaq(): Metadata {
    return {
      title: i18next.t("static.faq.page-title")
    };
  }

  function buildForMarket(): Metadata {
    return {
      title: i18next.t("market.title")
    };
  }

  function buildForMobile(): Metadata {
    // Title already carries the brand ("Ecency Mobile"); opt out of the root
    // title.template so it does not render "Ecency Mobile | Ecency".
    return {
      title: { absolute: i18next.t("static.mobile.page-title") }
    };
  }

  function buildForOnboardFriend(): Metadata {
    return {
      title: "Onboarding a Friend"
    };
  }

  function buildForPerks(): Metadata {
    return {
      title: i18next.t("perks.page-title")
    };
  }

  function buildForGift(): Metadata {
    return {
      title: i18next.t("points-gift.page-title"),
      description: i18next.t("points-gift.subtitle")
    };
  }

  function buildForProposals(): Metadata {
    return {
      title: i18next.t("proposals.page-title"),
      description: i18next.t("proposals.page-description")
    };
  }

  function buildForSearch(): Metadata {
    return {
      title: i18next.t("search-page.title"),
      description: i18next.t("search-page.description")
    };
  }

  function buildForSignUp(): Metadata {
    return {
      title: i18next.t("sign-up.header")
    };
  }

  function buildForWitnesses(): Metadata {
    return {
      title: i18next.t("witnesses.page-title"),
      description: i18next.t("witnesses.page-description")
    };
  }

  function buildForNotFound(): Metadata {
    return {
      title: i18next.t("not-found.title"),
      description: i18next.t("not-found.description")
    };
  }

  export async function getForPage(name: string): Promise<Metadata> {
    await initI18next();
    if (name === "about") return buildForAbout();
    if (name === "chats") return buildForChats();
    if (name === "communities") return buildForCommunities();
    if (name === "community-create") return buildForCommunityCreate();
    if (name === "contributors") return buildForContributors();
    if (name === "creator-economy") return buildForCreatorEconomy();
    if (name === "decks") return buildForDecks();
    if (name === "discover") return buildForDiscover();
    if (name === "curation") return buildForCuration();
    if (name === "curation-guide") return buildForCurationGuide();
    if (name === "publish") return buildForPublish();
    if (name === "draft") return buildForSubmit();
    if (name === "submit") return buildForSubmit();
    if (name === "faq") return buildForFaq();
    if (["market-swap", "market-limit", "market-advanced"].includes(name))
      return buildForMarket();
    if (name === "mobile") return buildForMobile();
    if (name === "onboard-friend") return buildForOnboardFriend();
    if (name === "perks") return buildForPerks();
    if (name === "gift") return buildForGift();
    if (name === "proposals") return buildForProposals();
    if (name === "search") return buildForSearch();
    if (name === "signup") return buildForSignUp();
    if (name === "witnesses") return buildForWitnesses();
    if (name === "not-found") return buildForNotFound();
    return {};
  }
}
