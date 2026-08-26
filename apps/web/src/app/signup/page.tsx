import { PagesMetadataGenerator } from "@/features/metadata";
import { Button } from "@/features/ui";
import { UilArrowRight } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import { Metadata, ResolvingMetadata } from "next";
import Image from "next/image";
import Link from "next/link";

export async function generateMetadata(
  props: unknown,
  parent: ResolvingMetadata
): Promise<Metadata> {
  return PagesMetadataGenerator.getForPage("signup");
}

const options: { key: string; image: string; href: string; desktopOnly?: boolean; mobileLcp?: boolean }[] = [
  {
    key: "free",
    image: "/assets/undraw-mailbox.svg",
    href: "/signup/free",
    // The desktop hero is hidden on mobile, so this first card's illustration
    // is the page's LCP element there; preload it for mobile viewports.
    mobileLcp: true
  },
  {
    key: "premium",
    image: "/assets/undraw-credit-card.svg",
    href: "/signup/premium"
  },
  {
    key: "wallet",
    image: "/assets/undraw-crypto-wallet.svg",
    href: "/signup/wallet",
    desktopOnly: true
  },
  {
    key: "invited",
    image: "/assets/undraw-gifts.svg",
    href: "/signup/invited"
  }
];

export default async function Page({
  searchParams
}: {
  searchParams?: Promise<{ referral?: string }>;
}) {
  const params = await searchParams;
  const referral = typeof params?.referral === "string" ? params.referral : "";

  const getHref = (href: string) => (referral ? `${href}?referral=${encodeURIComponent(referral)}` : href);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 py-6">
      {/* Hoisted into <head> by React. The card <img>s stay lazy: at md+ the
          layout's hero is the LCP element and an unconditional high-priority
          card fetch would compete with it, so only mobile (where the hero is
          hidden and this card IS the LCP element) gets the early fetch. The
          media query complements the hero preload's (min-width: 768px). */}
      {options
        .filter((option) => option.mobileLcp)
        .map((option) => (
          <link
            key={`${option.key}-preload`}
            rel="preload"
            as="image"
            href={option.image}
            media="(max-width: 767px)"
            fetchPriority="high"
          />
        ))}
      {options.map((option) => (
        <div key={option.key} className={`bg-white dark:bg-dark-200 rounded-2xl p-6 flex flex-col justify-between ${option.desktopOnly ? "hidden md:flex" : ""}`}>
          <div className="uppercase opacity-50 font-bold text-sm">
            {i18next.t(`signup-options.${option.key}.label`)}
          </div>
          <div className="flex flex-col gap-4">
            <Image
              src={option.image}
              alt=""
              width={400}
              height={400}
              className="max-w-[160px] md:max-w-[200px] mx-auto my-6"
            />
            <div className="text-xl font-bold">
              {i18next.t(`signup-options.${option.key}.title`)}
            </div>
            <div className="text-gray-600 dark:text-gray-400 text-sm">
              {i18next.t(`signup-options.${option.key}.description`)}
            </div>
            <Link href={getHref(option.href)}>
              <Button size="lg" icon={<UilArrowRight />} className="w-full">
                {i18next.t(`signup-options.${option.key}.button`)}
              </Button>
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
