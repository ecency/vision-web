import React, { HTMLProps, useContext } from "react";
import { DropdownContext } from "@ui/dropdown/dropdown-context";
import { classNameObject, useFilteredProps } from "@ui/util";

interface Props {
  align?: "left" | "right" | "top" | "bottom" | "rightBottom" | "end";
  size?: "small" | "medium" | "large";
}

export function DropdownMenu(props: Omit<HTMLProps<HTMLDivElement>, "size"> & Props) {
  const { show } = useContext(DropdownContext);

  const nativeProps = useFilteredProps(props, ["align"]);

  // Opens with a fast CSS scale-in (compositor-only); closes instantly —
  // native menus vanish on dismiss, and an instant close reads as snappier.
  return show ? (
    <div
      {...nativeProps}
      className={classNameObject({
        "z-[1000] ecency-dropdown-menu absolute flex flex-col items-start border border-[--border-color] rounded-xl bg-white dark:bg-dark-200 animate-scale-in":
          true,
        "origin-top": props.align !== "top" && props.align !== "rightBottom",
        "origin-bottom": props.align === "top" || props.align === "rightBottom",
        "right-0": props.align === "right" || props.align === "end",
        "right-0 bottom-[100%]": props.align === "rightBottom",
        "left-0": !props.align || props.align === "left",
        "top-[100%]": (props.align ?? "bottom") === "bottom",
        "bottom-[100%]": props.align === "top",
        "min-w-[200px] py-2 gap-2 pr-3": !props.size || props.size === "medium",
        "min-w-[150px] py-1 gap-1 pr-2": !props.size || props.size === "small",
        "max-w-[calc(100vw-1.5rem)]": true,
        [props.className ?? ""]: !!props.className
      })}
    />
  ) : (
    <></>
  );
}
