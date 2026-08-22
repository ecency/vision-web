"use client";

import { classNameObject } from "@ui/util";
import { Theme } from "@/enums";
import { brightnessSvg } from "@ui/svg";
import * as ls from "@/utils/local-storage";
import { useClientTheme } from "@/api/queries"; // adjust path as needed
import i18next from "i18next";

interface Props {
    floatRight?: boolean;
}

export function NavbarSideThemeSwitcher({ floatRight }: Props) {
    const [theme, toggleTheme] = useClientTheme();

    if (!toggleTheme) return null;

    const isNight = theme === Theme.night;
    const changeTheme = () => {
        ls.remove("use_system_theme");
        toggleTheme();
    };

    return (
        <button
            type="button"
            className={classNameObject({
                "switch-theme": true,
                "[&>svg]:size-5": true,
                "ml-[auto]": floatRight,
                switched: isNight
            })}
            onClick={changeTheme}
            aria-label={
                isNight
                    ? i18next.t("theme-switcher.to-day", { defaultValue: "Switch to light theme" })
                    : i18next.t("theme-switcher.to-night", { defaultValue: "Switch to dark theme" })
            }
            aria-pressed={isNight}
        >
            {brightnessSvg}
        </button>
    );
}
