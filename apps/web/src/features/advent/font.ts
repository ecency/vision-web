import type { CSSProperties } from "react";
import { fredokaFamily } from "@/fonts/raidstead";

/// Headings in the same rounded face as Raidstead. Set on the page and on the
/// door sheet, which renders in a portal outside the page.
export const adventFont = { "--rs-display-font": fredokaFamily } as CSSProperties;
