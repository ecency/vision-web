"use client";

import useMount from "react-use/lib/useMount";

export function HiringConsoleLog() {
  useMount(() => {
    if (process.env.NODE_ENV === "production") {
      console.log(`@@@@@@@(((((@@@@@@@@@@@@@
@@@(((((((((((((@@@@@@@@@
@((((@@@@@@@@@((((@@@@@@@
@(((@@@(((((@@@((((%@@@@@
((((@@@(((@@@@#((((((((%@
((((@@@((((((((((@@@@((((
((((@@@@@@&&&@@@@@@@@@(((
((((@@@@@@@@@@@@@@@@@((((
(((((%@@@@@@@@@%%(((((((@
@@(((((((((((((((((((@@@@`);
      console.log(
        "%c%s",
        "font-size: 12px;",
        "Are you developer, looking ways to contribute? Website is opensource: \nhttps://github.com/ecency/vision-web \n\n"
      );
    }
  });

  return <></>;
}
