import { UilApple, UilMicrosoft } from "@tooni/iconscout-unicons-react";
import i18next from "i18next";
import Link from "next/link";

const shortcutsList = [
  {
    name: i18next.t("publish.action-bar.bold"),
    macKeys: "⌘ + B",
    winKeys: "Ctrl + B"
  },
  {
    name: i18next.t("publish.action-bar.italic"),
    macKeys: "⌘ + I",
    winKeys: "Ctrl + I"
  },
  {
    name: i18next.t("publish.action-bar.strikethrough"),
    macKeys: "⌘ + Shift + S",
    winKeys: "Ctrl + Shift + S"
  }
];

export function PublishOnboardingToolbar() {
  return (
    <div className="pt-4 flex flex-col gap-2">
      <div className="font-bold">{i18next.t("publish.get-started.toolbar-description")}</div>
      {i18next.t("publish.get-started.toolbar-text")}
      <div className="pt-6">
        <div className="grid grid-cols-3 pb-2 border-b border-[--border-color] text-sm">
          <div>{i18next.t("publish.get-started.shortcut")}</div>
          <div className="flex items-center gap-2">
            <UilApple className="size-4" />
            Mac
          </div>
          <div className="flex items-center gap-2">
            <UilMicrosoft className="size-4" />
            Windows
          </div>
        </div>
        {shortcutsList.map((shortcut) => (
          <div
            className="grid grid-cols-3 my-4 gap-2 text-xs items-center font-semibold"
            key={shortcut.name}
          >
            <span>{shortcut.name} </span>
            <div className="flex justify-start">
              <div className="bg-gray-200 dark:bg-gray-700 p-1.5 rounded-lg">
                {shortcut.macKeys}
              </div>
            </div>
            <div className="flex justify-start">
              <div className="bg-gray-200 dark:bg-gray-700 p-1.5 rounded-lg">
                {shortcut.winKeys}
              </div>
            </div>
          </div>
        ))}
        <Link
          className="text-sm"
          href="https://docs.ecency.com/ecency/publish/#keyboard-shortcuts"
          target="_blank"
        >
          {i18next.t("publish.get-started.more-shortcuts")}
        </Link>
      </div>
    </div>
  );
}
