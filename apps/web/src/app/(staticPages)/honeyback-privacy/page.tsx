import { Navbar } from "@/features/shared/navbar";
import { ScrollToTop } from "@/features/shared/scroll-to-top";
import { Theme } from "@/features/shared/theme";
import i18next from "i18next";
import { Metadata } from "next";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: i18next.t("static.honeyback.privacy.title"),
    description: i18next.t("static.honeyback.privacy.description")
  };
}

// The policy the store listings link to. Written from what the game does;
// the game's repository keeps the source of truth for the services named here.
export default function HoneybackPrivacy() {
  const t = (key: string) => i18next.t(`static.honeyback.privacy.${key}`);
  const keeps = ["install", "play", "hive", "purchases"];
  const services = ["admob", "ga", "sentry", "hivesigner"];
  const choices = ["consent", "hive", "delete", "access"];

  return (
    <>
      <ScrollToTop />
      <Theme />
      <Navbar />

      <div className="app-content static-page privacy-page">
        <div className="static-content">
          <h1 className="page-title" id="honeyback-privacy">
            {t("heading")}
          </h1>
          <p className="static-last-updated">{t("effective")}</p>
          <p>{t("intro")}</p>

          <h2 id="what-the-game-keeps">{t("keeps-title")}</h2>
          {keeps.map((key) => (
            <p key={key}>
              <strong>{t(`keeps.${key}-title`)}</strong> {t(`keeps.${key}-body`)}
            </p>
          ))}

          <h2 id="services">{t("services-title")}</h2>
          {services.map((key) => (
            <p key={key}>
              <strong>{t(`services.${key}-title`)}</strong> {t(`services.${key}-body`)}
            </p>
          ))}

          <h2 id="what-we-do-not-do">{t("not-title")}</h2>
          <p>{t("not-body")}</p>

          <h2 id="children">{t("children-title")}</h2>
          <p>{t("children-body")}</p>

          <h2 id="your-choices">{t("choices-title")}</h2>
          <ul>
            {choices.map((key) => (
              <li key={key}>
                <strong>{t(`choices.${key}-title`)}</strong> {t(`choices.${key}-body`)}
              </li>
            ))}
          </ul>
          <p>{t("complaint")}</p>

          <h2 id="retention">{t("retention-title")}</h2>
          <p>{t("retention-body")}</p>

          <h2 id="contact">{t("contact-title")}</h2>
          <p>
            {t("contact-body")} <a href="mailto:hello@ecency.com">hello@ecency.com</a>
          </p>

          <h2 id="changes">{t("changes-title")}</h2>
          <p>{t("changes-body")}</p>
          <p>
            <Link href="/honeyback-about">{t("about-link")}</Link>
          </p>
        </div>
      </div>
    </>
  );
}
