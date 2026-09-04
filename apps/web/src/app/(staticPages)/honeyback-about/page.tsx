import { Navbar } from "@/features/shared/navbar";
import { ScrollToTop } from "@/features/shared/scroll-to-top";
import { Theme } from "@/features/shared/theme";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Honeyback",
  description:
    "A kind little flying game by Ecency. Fly, rewind, send honey to a stranger, and restore a faded garden. Kindness comes back."
};

// The landing page for the game: what it is, how it plays, and where to get
// it once the store listings exist. Store buttons say "coming soon" until then.
export default function HoneybackAbout() {
  const beats = [
    {
      title: "Fly",
      body: "One tap keeps the bee in the air. Gates come faster the further you go, and every gate is a point."
    },
    {
      title: "Rewind",
      body: "A crash is not the end. Rewind a few seconds and take the gate again; three a run are free."
    },
    {
      title: "Send honey",
      body: "Once a day, send honey to another player. It costs you nothing, they get coins, and kindness comes back as karma."
    },
    {
      title: "Restore the garden",
      body: "Pieces you gather restore a faded garden, stage by stage, and each stage dresses the bee and the world."
    }
  ];

  return (
    <>
      <ScrollToTop />
      <Theme />
      <Navbar />

      <div className="app-content static-page honeyback-page">
        <section
          className="honeyback-hero"
          style={{ background: "linear-gradient(180deg, #FFF7E6 0%, #FFE9B8 100%)" }}
        >
          <div className="mx-auto flex max-w-5xl flex-col items-center px-6 py-16 text-center md:flex-row md:text-left">
            <div className="md:w-1/2">
              <img
                src="/assets/honeyback/honeyback-logo.svg"
                alt="Honeyback"
                className="mx-auto w-full max-w-md md:mx-0"
              />
              <p className="mt-6 text-2xl font-semibold" style={{ color: "#B8760F" }}>
                Kindness comes back.
              </p>
              <p className="mt-4 text-lg" style={{ color: "#2B1A0E" }}>
                A kind little flying game by Ecency. Fly a bee through the gates, rewind when you
                crash, send honey to a stranger once a day, and restore a garden that faded.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
                <span
                  className="rounded-2xl px-6 py-3 text-base font-bold opacity-70"
                  style={{ background: "#F4B223", color: "#2B1A0E" }}
                  aria-disabled="true"
                >
                  App Store · coming soon
                </span>
                <span
                  className="rounded-2xl px-6 py-3 text-base font-bold opacity-70"
                  style={{ background: "#F4B223", color: "#2B1A0E" }}
                  aria-disabled="true"
                >
                  Google Play · coming soon
                </span>
              </div>
            </div>
            <div className="mt-10 md:mt-0 md:w-1/2">
              <img
                src="/assets/honeyback/bee-color.svg"
                alt="The Honeyback bee"
                className="mx-auto w-64 md:w-80"
              />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-14">
          <h2 className="text-3xl font-bold">How it plays</h2>
          <div className="mt-8 grid gap-6 md:grid-cols-2">
            {beats.map((beat) => (
              <div
                key={beat.title}
                className="rounded-3xl p-6"
                style={{ background: "#FFF7E6", color: "#2B1A0E" }}
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
            style={{ background: "#3FA66B", color: "#FFF7E6" }}
          >
            <img
              src="/assets/honeyback/icon-512.png"
              alt=""
              className="h-28 w-28 rounded-3xl"
              width={112}
              height={112}
            />
            <div>
              <h2 className="text-2xl font-bold">Your Hive name in the garden</h2>
              <p className="mt-2">
                Link your Hive account through Ecency, HiveSigner or Keychain and your name shows on
                the leaderboard and on the honey you send. No key ever enters the game, and a new
                phone finds your garden again.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-16 text-center">
          <p className="opacity-80">
            Built with ♥ by the Ecency team.{" "}
            <Link href="/honeyback-privacy" className="underline">
              Privacy policy
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}
