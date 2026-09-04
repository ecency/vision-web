import { Navbar } from "@/features/shared/navbar";
import { ScrollToTop } from "@/features/shared/scroll-to-top";
import { Theme } from "@/features/shared/theme";
import i18next from "i18next";
import { Metadata } from "next";
import Link from "next/link";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: i18next.t("static.honeyback.about.title"),
    description: i18next.t("static.honeyback.about.description")
  };
}

// The landing page for the game: what it is, how it plays, and where to get
// it once the store listings exist. Store buttons say "coming soon" until then.
export default function HoneybackAbout() {
  const t = (key: string) => i18next.t(`static.honeyback.about.${key}`);
  const beats = ["fly", "rewind", "honey", "garden"].map((key) => ({
    key,
    title: t(`beats.${key}-title`),
    body: t(`beats.${key}-body`)
  }));
  const ink = "#2B1A0E";

  return (
    <>
      <ScrollToTop />
      <Theme />
      <Navbar />

      <div className="app-content static-page honeyback-page">
        <section style={{ background: "linear-gradient(180deg, #FFF7E6 0%, #FFE9B8 100%)" }}>
          <div className="mx-auto flex max-w-5xl flex-col items-center px-6 py-16 text-center md:flex-row md:text-left">
            <div className="md:w-1/2">
              <h1 className="sr-only">{t("heading")}</h1>
              <img
                src="/assets/honeyback/honeyback-logo.svg"
                alt=""
                className="mx-auto w-full max-w-md md:mx-0"
              />
              <p className="mt-6 text-2xl font-semibold" style={{ color: "#B8760F" }}>
                {t("tagline")}
              </p>
              <p className="mt-4 text-lg" style={{ color: ink }}>
                {t("intro")}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
                {["store-ios", "store-android"].map((key) => (
                  <span
                    key={key}
                    className="rounded-2xl px-6 py-3 text-base font-bold opacity-70"
                    style={{ background: "#F4B223", color: ink }}
                    aria-disabled="true"
                  >
                    {t(key)}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-10 md:mt-0 md:w-1/2">
              <img
                src="/assets/honeyback/bee-color.svg"
                alt={t("bee-alt")}
                className="mx-auto w-64 md:w-80"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-3xl font-bold">{t("how-title")}</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {beats.map((beat) => (
              <div
                key={beat.key}
                className="rounded-3xl p-6"
                style={{ background: "#FFF7E6", color: ink }}
              >
                <h3 className="text-xl font-bold">{beat.title}</h3>
                <p className="mt-2">{beat.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-14">
          <div
            className="flex flex-col items-center gap-6 rounded-3xl p-8 md:flex-row"
            style={{ background: "#3FA66B", color: ink }}
          >
            <img
              src="/assets/honeyback/icon-512.png"
              alt=""
              className="h-28 w-28 rounded-3xl"
              width={112}
              height={112}
            />
            <div>
              <h2 className="text-2xl font-bold">{t("hive-title")}</h2>
              <p className="mt-2">{t("hive-body")}</p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-16 text-center">
          <p className="opacity-80">
            {t("footer")}{" "}
            <Link href="/honeyback-privacy" className="underline">
              {t("privacy-link")}
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}
