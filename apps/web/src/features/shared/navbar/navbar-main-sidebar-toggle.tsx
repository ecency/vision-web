import { Button } from "@/features/ui";
import { UilBars } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Image from "next/image";
import { IntentLink } from "@/features/shared/intent-link";
import defaults from "@/defaults";

interface Props {
  onClick: () => void;
}

export function NavbarMainSidebarToggle({ onClick }: Props) {
  return (
    <div className="h-[40px] min-w-[40px] md:min-w-[60px] flex items-center gap-1.5 cursor-pointer relative">
      <Button onClick={onClick} appearance="gray-link" noPadding={true} icon={<UilBars />} aria-label={i18next.t("navbar.toggle-menu")} />
      <IntentLink className="hidden md:block" href="/">
        {/*
          priority: the logo is always above the fold; the default-lazy
          behavior deferred its request until the first layout finished
          computing viewport intersection, so it popped in well after first
          paint (#1664).
        */}
        <Image
          src={defaults.logo}
          className="logo relative min-w-[40px] max-w-[40px]"
          alt="Logo"
          width={40}
          height={40}
          priority
        />
      </IntentLink>
    </div>
  );
}
