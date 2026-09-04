import { Navbar } from "@/features/shared/navbar";
import { ScrollToTop } from "@/features/shared/scroll-to-top";
import { Theme } from "@/features/shared/theme";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Honeyback Privacy Policy",
  description:
    "What the Honeyback game collects, why, who it is shared with, and what you can do about it."
};

// The policy the store listings link to. Written from what the game does;
// the game's repository keeps the source of truth for the services named here.
export default function HoneybackPrivacy() {
  return (
    <>
      <ScrollToTop />
      <Theme />
      <Navbar />

      <div className="app-content static-page privacy-page">
        <div className="static-content">
          <h1 className="page-title" id="honeyback-privacy">
            Honeyback privacy policy
          </h1>
          <p className="static-last-updated">Effective: September 4, 2026</p>
          <p>
            Honeyback is a game by Ecency. This page says what the game collects, why, who it is
            shared with, and what you can do about it. It is written to be read, not skimmed.
          </p>

          <h2 id="what-the-game-keeps">What the game keeps about you</h2>
          <p>
            <strong>An install id.</strong> When the game first runs it registers an anonymous
            install with our server and keeps a random id and a secret on the device. That id is
            how your scores, pieces, karma and honey are yours across launches. It is not tied to
            your name, email or phone number.
          </p>
          <p>
            <strong>Your play.</strong> Scores, the pieces you gather, the stages you restore,
            honey you send and receive, your streak days, and the day you played. These live on our
            server so the leaderboard, the journey and gifts work, and so a linked account can find
            its garden on a new phone.
          </p>
          <p>
            <strong>Your Hive account name, only if you link it.</strong> Linking through
            HiveSigner, Keychain or Ecency gives us your account name and a one-time signed login
            proof. We keep the name so it can show on the leaderboard and on honey you send. We
            never receive or keep a key, and the login proof is good for nothing else and is used
            once. You can unlink at any time in Settings, and sign other devices out of your account
            there too.
          </p>
          <p>
            <strong>Purchases.</strong> If you buy &quot;remove ads&quot;, the store (Apple or
            Google) handles the payment. We keep a note that this account owns it so it survives a
            reinstall or a new phone. We never see your payment details.
          </p>

          <h2 id="services">Services that run inside the game</h2>
          <p>
            <strong>Google AdMob</strong> shows rewarded ads, only when you choose to watch one,
            and only after you have made your choice in the consent form the game shows on first
            launch. AdMob may use your advertising id and device information as described in
            Google&apos;s privacy policy. You can change your choice any time from &quot;Privacy
            choices&quot; in Settings.
          </p>
          <p>
            <strong>GameAnalytics</strong> receives gameplay events (a run started, a stage
            restored, an ad watched) and device information so we can see what players enjoy and
            where they get stuck. It receives no name, email or contact detail.
          </p>
          <p>
            <strong>Sentry</strong> receives crash reports and errors: what the game was doing when
            it crashed, the device model and OS version, and the game version. We turn off the
            collection of personal data in Sentry; no screenshots are sent.
          </p>
          <p>
            <strong>HiveSigner</strong> handles the sign-in when you link a Hive account and
            receives only what any HiveSigner sign-in receives. Ecency and Keychain sign the login
            proof on your device and hand the game only that proof and your account name.
          </p>

          <h2 id="what-we-do-not-do">What we do not do</h2>
          <p>
            We do not sell your data. We do not run tracking across other apps or sites. We do not
            show ads you did not ask for. We do not collect precise location, contacts, photos or
            your address book.
          </p>

          <h2 id="children">Children</h2>
          <p>
            Honeyback is not directed at children under 13 (or the age of digital consent where you
            live), and we do not knowingly collect personal data from them. The consent form and
            rewarded ads follow the platform rules for the age settings on your device.
          </p>

          <h2 id="your-choices">Your choices and rights</h2>
          <ul>
            <li>
              <strong>Ads and consent:</strong> &quot;Privacy choices&quot; in Settings reopens the
              consent form.
            </li>
            <li>
              <strong>Hive account:</strong> unlink in Settings; the name is removed from our server
              at once.
            </li>
            <li>
              <strong>Delete everything:</strong> &quot;Delete my data&quot; in Settings removes your
              install and, when no other device plays as you, everything attached to it, at once.
              If you no longer have the device, write to the address below with your install id or
              your Hive account name and we delete it for you.
            </li>
            <li>
              <strong>Access and correction:</strong> the same address, and we answer within thirty
              days.
            </li>
          </ul>
          <p>
            If you are in the EEA, the UK or another region with a data protection law, you also
            have the right to complain to your local authority.
          </p>

          <h2 id="retention">Retention</h2>
          <p>
            Play data is kept while the install exists. Crash reports are kept by Sentry for ninety
            days. Analytics are kept in aggregate. A deleted install is gone from our server at once
            through the app, or within thirty days of a written request.
          </p>

          <h2 id="contact">Contact</h2>
          <p>
            Ecency, <a href="mailto:hello@ecency.com">hello@ecency.com</a>
          </p>

          <h2 id="changes">Changes</h2>
          <p>
            We will update this page when the game changes what it collects, and the version in the
            store listing will say when.
          </p>
          <p>
            <Link href="/honeyback-about">About Honeyback</Link>
          </p>
        </div>
      </div>
    </>
  );
}
