import { ButtonAppearance, ButtonSize } from "@ui/button/props";

export const BUTTON_STYLES: Record<ButtonAppearance, string> = {
  primary:
    "bg-blue-dark-sky hover:bg-blue-dark-sky-hover focus:bg-blue-dark-sky-active text-white hover:text-white disabled:opacity-50 disabled:hover:bg-blue-dark-sky disabled:focus:bg-blue-dark-sky",
  secondary:
    "bg-gray-600 hover:bg-gray-700 disabled:hover:bg-gray-600 focus:bg-gray-800 text-white dark:bg-blue-metallic-20 disabled:dark:hover:bg-blue-metallic-20 dark:hover:bg-blue-metallic disabled:opacity-50",
  // The disabled:hover / disabled:focus resets are load-bearing, not belt and
  // braces: hover: and disabled: are independent variants, so dimming opacity
  // alone still lets a disabled button light up under the cursor and read as
  // clickable.
  link: "text-blue-dark-sky hover:text-blue-dark-sky-hover focus:text-blue-dark-sky-active disabled:opacity-50 disabled:hover:text-blue-dark-sky disabled:focus:text-blue-dark-sky",
  danger:
    "bg-red hover:bg-red-020 focus:bg-red-030 text-white disabled:opacity-50 disabled:hover:bg-red disabled:focus:bg-red",
  success: "bg-green hover:bg-green-hover focus:bg-green-hover text-white disabled:grayscale",
  warning: "",
  info: "bg-info-default hover:info-hover focus:bg-info-focus text-white disabled:opacity-50 disabled:hover:bg-info-default disabled:focus:bg-info-default",
  "gray-link":
    "text-gray-600 hover:text-blue-dark-sky focus:text-blue-dark-sky-active disabled:opacity-50 disabled:hover:text-gray-600",
  white:
    "text-blue-dark-sky bg-white hover:bg-gray-100 focus:bg-gray-200 dark:bg-dark-default dark:hover:bg-dark-200 dark:focus:bg-gray-900 dark:text-white disabled:opacity-75",
  gray: "bg-gray-200 text-gray-600 dark:text-gray-400 dark:bg-gray-800 hover:bg-blue-duck-egg hover:text-blue-dark-sky hover:dark:bg-dark-default focus:text-blue-dark-sky-active disabled:opacity-50",
  "white-link": "text-white hover:opacity-50 focus:opacity-75 disabled:opacity-50",
  pressed: "text-red hover:text-red-040 bg:blue-duck-egg dark:bg-dark-default",
  hivesigner: ""
};

export const BUTTON_OUTLINE_STYLES: Record<ButtonAppearance, string> = {
  primary:
    "border-blue-dark-sky hover:border-blue-dark-sky-hover focus:border-blue-dark-sky-active text-blue-dark-sky hover:text-blue-dark-sky-hover focus:text-blue-dark-sky-active disabled:opacity-50",
  secondary:
    "border-[--border-color] hover:bg-[--border-color] focus:bg-[--border-color] hover:bg-opacity-10 focus:bg-opacity-20 text-gray-600 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-500",
  link: "",
  danger:
    "border-red hover:border-red-020 focus:border-red-030 text-red hover:text-red-020 focus:text-red-030",
  success: "",
  warning: "",
  info: "border-info-default hover:border-info-hover focus:border-info-focus text-info-default hover:text-info-hover focus:text-info-focus",
  "gray-link": "",
  "white-link": "",
  pressed: "",
  white:
    "text-white border-white hover:border-gray-100 focus:border-gray-200 dark:border-dark-default dark:hover:border-dark-200 dark:focus:border-gray-900 dark:text-dark-default",
  gray: "",
  hivesigner: "text-red border border-red"
};

export const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: "h-[2rem] text-sm font-[500] px-2 text-xs",
  sm: "h-[2rem] text-sm font-[500] px-2",
  md: "h-[2.125rem] px-3",
  lg: "h-[2.5rem] px-4",
  display: "h-[3rem] px-4 text-sm font-semibold"
};

export const BUTTON_IN_GROUP =
  "[&>.ecency-input-group-part>button]:rounded-tl-none [&>.ecency-input-group-part>button]:rounded-bl-none [&>.ecency-input-group-part>button]:h-[2.75rem]";
