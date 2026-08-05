import { Navbar } from "@/features/shared/navbar";
import { ScrollToTop } from "@/features/shared/scroll-to-top";
import { Theme } from "@/features/shared/theme";
import { Tsx } from "@/features/i18n/helper";
import { PagesMetadataGenerator } from "@/features/metadata";
import { Metadata, ResolvingMetadata } from "next";
import i18next from "i18next";
import Link from "next/link";


export async function generateMetadata(
  props: unknown,
  parent: ResolvingMetadata
): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("mobile");
}

export default function MobilePage() {
  const storeLinks = [
    {
      href: "https://ios.ecency.com",
      label: i18next.t("static.mobile.cta-ios"),
      icon: "/assets/icon-apple.svg"
    },
    {
      href: "https://android.ecency.com",
      label: i18next.t("static.mobile.cta-android"),
      icon: "/assets/icon-android.png"
    }
  ];

  const benefits = [
    {
      title: i18next.t("static.mobile.benefits.communities-title"),
      description: i18next.t("static.mobile.benefits.communities-description")
    },
    {
      title: i18next.t("static.mobile.benefits.create-title"),
      description: i18next.t("static.mobile.benefits.create-description")
    },
    {
      title: i18next.t("static.mobile.benefits.wallet-title"),
      description: i18next.t("static.mobile.benefits.wallet-description")
    },
    {
      title: i18next.t("static.mobile.benefits.notifications-title"),
      description: i18next.t("static.mobile.benefits.notifications-description")
    }
  ];

  const features = [
    {
      title: i18next.t("static.mobile.features.interface-title"),
      description: i18next.t("static.mobile.features.interface-description")
    },
    {
      title: i18next.t("static.mobile.features.themes-title"),
      description: i18next.t("static.mobile.features.themes-description")
    },
    {
      title: i18next.t("static.mobile.features.opensource-title"),
      description: i18next.t("static.mobile.features.opensource-description")
    }
  ];

  const resources = [
    {
      href: "/faq",
      label: i18next.t("static.mobile.resources.faq"),
      external: false
    },
    {
      href: "/ecency/@ecency/ecency-mobile-rebrand-better-onboarding-communities-and-more",
      label: i18next.t("static.mobile.resources.blog"),
      external: false
    },
    {
      href: "https://github.com/ecency/vision-mobile",
      label: i18next.t("static.mobile.resources.github"),
      external: true
    }
  ];

  const screenshotPairs = [
    {
      title: i18next.t("static.mobile.screenshots.feed-title", { defaultValue: "Feed" }),
      darkSrc: "/assets/ecency-feed1.jpg",
      lightSrc: "/assets/ecency-feed2.jpg"
    },
    {
      title: i18next.t("static.mobile.screenshots.profile-title", { defaultValue: "Profile" }),
      darkSrc: "/assets/ecency-profile1.jpg",
      lightSrc: "/assets/ecency-profile2.jpg"
    },
    {
      title: i18next.t("static.mobile.screenshots.wallet-title", { defaultValue: "Wallet" }),
      darkSrc: "/assets/ecency-wallet1.jpg",
      lightSrc: "/assets/ecency-wallet2.jpg"
    },
    {
      title: i18next.t("static.mobile.screenshots.replies-title", { defaultValue: "Replies" }),
      darkSrc: "/assets/ecency-reply1.jpg",
      lightSrc: "/assets/ecency-reply2.jpg"
    },
    {
      title: i18next.t("static.mobile.screenshots.multi-token-title", { defaultValue: "Multi-token" }),
      darkSrc: "/assets/ecency-multi-token1.jpg",
      lightSrc: "/assets/ecency-multi-token2.jpg"
    }
  ];

  return (
    <>
      <ScrollToTop />
      <Theme />
      <Navbar />

      <div className="app-content static-page mobile-page">
        <section className="mobile-hero">
          <div className="mobile-hero__content">
            <Tsx k="static.mobile.hero-title">
              <h1 className="mobile-hero__title" />
            </Tsx>
            <p className="mobile-hero__subtitle">
              {i18next.t("static.mobile.hero-subtitle")}
            </p>
            <div className="mobile-store-links">
              {storeLinks.map((store) => (
                <a
                  key={store.href}
                  href={store.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mobile-store-link"
                >
                  <img src={store.icon} alt="" aria-hidden="true" />
                  {store.label}
                </a>
              ))}
            </div>
            <p className="mobile-hero__footnote">
              {i18next.t("static.mobile.hero-footnote")}
            </p>
          </div>
          <div className="mobile-hero__visual">
            <img
              src="/assets/phone-light-tablet.png"
              alt={i18next.t("static.mobile.screenshots-tablet-alt")}
              loading="lazy"
            />
            <img
              src="/assets/phone-dark-tablet.png"
              alt={i18next.t("static.mobile.screenshots-dark-alt")}
              loading="lazy"
            />
          </div>
        </section>

        <section className="mobile-section mobile-benefits">
          <h2 className="mobile-section__title">
            {i18next.t("static.mobile.benefits-title")}
          </h2>
          <div className="mobile-grid">
            {benefits.map((item) => (
              <article key={item.title} className="mobile-card">
                <h3 className="mobile-card__title">{item.title}</h3>
                <p className="mobile-card__body">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mobile-section mobile-features">
          <h2 className="mobile-section__title">
            {i18next.t("static.mobile.features-title")}
          </h2>
          <div className="mobile-grid">
            {features.map((item) => (
              <article key={item.title} className="mobile-card">
                <h3 className="mobile-card__title">{item.title}</h3>
                <p className="mobile-card__body">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mobile-section mobile-gallery">
          <h2 className="mobile-section__title">
            {i18next.t("static.mobile.screenshots-title")}
          </h2>
          <p className="mobile-section__description">
            {i18next.t("static.mobile.screenshots-description")}
          </p>
          <div className="mobile-gallery__grid">
            {screenshotPairs.map((pair) => (
              <article key={pair.title} className="mobile-gallery__pair">
                <header className="mobile-gallery__pair-header">
                  <h3 className="mobile-gallery__pair-title">{pair.title}</h3>
                  <p className="mobile-gallery__pair-subtitle">
                    {i18next.t("static.mobile.screenshots.pair-subtitle", {
                      defaultValue: "See how it looks in dark and light themes",
                    })}
                  </p>
                </header>
                <div className="mobile-gallery__pair-images">
                  <figure className="mobile-gallery__screenshot">
                    <span className="mobile-gallery__badge">
                      {i18next.t("static.mobile.screenshots.dark-label", { defaultValue: "Dark theme" })}
                    </span>
                    <img
                      src={pair.darkSrc}
                      alt={`${pair.title} ${i18next.t("static.mobile.screenshots.dark-label", { defaultValue: "Dark theme" })}`}
                      loading="lazy"
                    />
                  </figure>
                  <figure className="mobile-gallery__screenshot">
                    <span className="mobile-gallery__badge mobile-gallery__badge--light">
                      {i18next.t("static.mobile.screenshots.light-label", { defaultValue: "Light theme" })}
                    </span>
                    <img
                      src={pair.lightSrc}
                      alt={`${pair.title} ${i18next.t("static.mobile.screenshots.light-label", { defaultValue: "Light theme" })}`}
                      loading="lazy"
                    />
                  </figure>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mobile-section mobile-resources">
          <h2 className="mobile-section__title">
            {i18next.t("static.mobile.resources-title")}
          </h2>
          <div className="mobile-resources__list">
            {resources.map((resource) => (
              resource.external ? (
                <a
                  key={resource.href}
                  href={resource.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mobile-resource"
                >
                  {resource.label}
                </a>
              ) : (
                <Link key={resource.href} href={resource.href} className="mobile-resource">
                  {resource.label}
                </Link>
              )
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
