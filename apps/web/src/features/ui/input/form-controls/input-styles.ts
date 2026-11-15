// TODO: Add invalid styles based on aria-invalid
// TODO: Add disabled styles
export const INPUT_STYLES =
  "border-2 w-full outline-none shadow-0 focus:border-gray-500 hover:border-gray-300 duration-300";

export const INPUT_DARK_STYLES =
  "dark:border-dark-600-005-light dark:hover:border-dark-600-010-light dark:bg-dark-default";

// The dark variant matters: `dark:border-*` above has the same specificity as
// `aria-invalid:border-red` and comes later in the CSS, so in the dark theme an
// invalid input lost its red border. `dark:aria-invalid:` stacks a class, the
// attribute and the dark selector, which wins over the dark border and its
// hover in the dark theme (#2075).
export const INVALID_INPUT_STYLES = "aria-invalid:border-red dark:aria-invalid:border-red";

export const INPUT_IN_GROUP =
  "[&>input]:rounded-[0] [&>input:first-child]:rounded-l-xl [&>input:last-child]:rounded-r-xl";

export const INPUT_SIZES: Record<"sm" | "md" | "xs", string> = {
  // Ensure a minimum 16px font size on inputs to avoid mobile browsers zooming on focus
  sm: "text-base py-1 px-2 rounded-lg",
  md: "text-base py-2 px-3 rounded-xl",
  xs: "px-2 py-1 text-base"
};
