"use client";

import React, { CSSProperties, JSX, useEffect, useRef, useState } from "react";
import { classNameObject } from "@ui/util";
import useClickAway from "react-use/lib/useClickAway";
import i18next from "i18next";
import { useRouter } from "next/navigation";
import useMount from "react-use/lib/useMount";
import { usePrevious } from "react-use";
import useUnmount from "react-use/lib/useUnmount";
import { UilArrowUpRight } from "@tooni/iconscout-unicons-react";

interface Props {
  items: any[];
  modeItems?: any[];
  header?: string;
  containerClassName?: string;
  renderer?: (item: any) => JSX.Element;
  onSelect?: (item: any) => void;
  children: JSX.Element;
  searchValue?: string;
  ignoreFirstInputFocus?: boolean;
  listStyle?: CSSProperties;
}

export function SuggestionList({
  children,
  containerClassName,
  modeItems,
  items,
  listStyle,
  header,
  searchValue,
  renderer,
  onSelect,
  ignoreFirstInputFocus
}: Props) {
  const parentRef = useRef<HTMLDivElement | null>(null);
  const clickAwayRef = useRef<HTMLDivElement | null>(null);

  const router = useRouter();

  const [showList, setShowList] = useState(false);

  const previousModeItems = usePrevious(modeItems);

  useMount(() => {
    document.addEventListener("keydown", watchKb);
    document.addEventListener("click", watchClick);

    const input = getPossibleInput();
    if (input) {
      if (input === document.activeElement && !ignoreFirstInputFocus) {
        setShowList(true);
      }

      if (ignoreFirstInputFocus) {
        input.blur();
      }

      input.addEventListener("focus", watchInputFocus);
      // Selecting an item closes the list without moving focus, so a focus event
      // alone never comes back — reopen on typing too.
      input.addEventListener("input", watchInputFocus);
    }
  });

  useUnmount(() => {
    document.removeEventListener("keydown", watchKb);
    document.removeEventListener("click", watchClick);

    const input = getPossibleInput();
    if (input) {
      input.removeEventListener("focus", watchInputFocus);
      input.removeEventListener("input", watchInputFocus);
    }
  });

  useClickAway(clickAwayRef, () => setShowList(false));

  useEffect(() => {
    if (previousModeItems !== modeItems && modeItems && modeItems.length > 0) {
      setShowList(true);
    }
  }, [previousModeItems, modeItems]);

  const getPossibleInput = () =>
    parentRef.current?.querySelector("input[type='text']") as HTMLInputElement | null;
  const focusItem = (index: number) =>
    (parentRef.current?.querySelectorAll(".list-item")[index] as HTMLLinkElement)?.focus?.();

  const focusInput = () => {
    const input = getPossibleInput();
    input?.focus();
  };

  const getFocusedIndex = (): number => {
    const el = parentRef.current?.querySelector(".list-item:focus") as HTMLLinkElement;
    if (el && el.parentElement) {
      // @ts-ignore
      return [...el.parentElement.children].indexOf(el);
    }

    return -1;
  };

  const moveUp = () => {
    const i = getFocusedIndex();
    if (i === 0) {
      focusInput();
      return;
    }
    focusItem(i - 1);
  };

  const moveDown = () => {
    const i = getFocusedIndex();
    focusItem(i + 1);
  };

  const watchKb = (e: KeyboardEvent) => {
    if (!showList) {
      return;
    }

    switch (e.keyCode) {
      case 38:
        e.preventDefault();
        moveUp();

        break;
      case 40:
        e.preventDefault();
        moveDown();
        break;
      default:
        break;
    }
  };

  const watchClick = (e: MouseEvent) => {
    if (!showList) {
      return;
    }

    const target = e.target as Element;
    const val = parentRef.current?.contains(target);
    setShowList(val === true);
  };

  const watchInputFocus = () => setShowList(true);

  const moreResultsClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowList(false);
    if (!!searchValue && !!history && !!location) {
      if (["/search-more", "/search-more/"].includes(location.pathname)) {
        router.push(`/search-more/?q=${encodeURIComponent(searchValue)}`);
      } else {
        router.push(`/search/?q=${encodeURIComponent(searchValue)}`);
      }
    }
  };

  return (
    <div
      className={classNameObject({
        "suggestion relative": true,
        [containerClassName ?? ""]: !!containerClassName
      })}
      ref={parentRef}
    >
      {children}
      <div ref={clickAwayRef}>
        <>
          {showList && modeItems && modeItems.length > 0 && (
            <div className="absolute border border-[--border-color] left-0 top-[calc(100%+0.5rem)] w-full z-[100] rounded-2xl overflow-hidden min-w-[200px] bg-white mb-4 origin-top animate-scale-in">
              {modeItems.map(
                (modeItem, modeKey) =>
                  modeItem.items.length > 0 && (
                    <div className="search-suggestion-list" key={modeKey}>
                      {modeItem.header && (
                        <div className="bg-gray-100 dark:bg-gray-900 text-sm font-semibold text-gray-600 dark:text-gray-400 p-2">
                          {modeItem.header}
                        </div>
                      )}
                      <div className="list-body">
                        {modeItem.items.map((x: any, i: number) => (
                          <a
                            href="#"
                            key={i}
                            className="flex pointer items-center px-4 py-3 text-gray-warm hover:bg-blue-dark-sky-040 dark:text-silver dark:hover:text-white dark:bg-dark-200 dark:hover:bg-dark-default duration-300 border-b border-[--border-color] last:border-0"
                            // Keep focus on the input: a blur here can commit the
                            // half-typed value and re-render this item away before
                            // the click lands.
                            onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                            onClick={(e: React.MouseEvent) => {
                              e.preventDefault();
                              modeItem.onSelect?.(x);
                              setShowList(false);
                            }}
                          >
                            {modeItem.renderer?.(x) ?? x}
                          </a>
                        ))}
                      </div>
                    </div>
                  )
              )}
              <div className="search-suggestion-list more-result">
                <div className="list-body">
                  <a
                    href="#"
                    className="flex items-center text-gray-warm hover:bg-blue-dark-sky-040 dark:text-silver dark:hover:text-white dark:bg-dark-200 dark:hover:bg-dark-default duration-300 border-t border-[--border-color] gap-1 text-xs uppercase font-bold px-4 py-3"
                    onClick={moreResultsClick}
                  >
                    {i18next.t("g.more-results")}
                    <UilArrowUpRight className="size-5" />
                  </a>
                </div>
              </div>
            </div>
          )}
          {showList && !modeItems && items?.length > 0 && (
            <div
              className="modal-suggestion-list rounded-3xl absolute origin-top animate-scale-in"
              style={listStyle}
            >
              {header && (
                <div className="bg-gray-100 dark:bg-dark-200 text-xs font-semibold text-gray-600 dark:text-white p-4">
                  {header}
                </div>
              )}
              <div className="list-body">
                {items.map((x, i) => (
                  <a
                    href="#"
                    key={i}
                    className="flex gap-2 pointer items-center px-4 py-3 text-gray-warm hover:bg-blue-dark-sky-040 dark:text-silver dark:hover:text-white dark:bg-dark-200 dark:hover:bg-dark-default duration-300 border-b border-[--border-color] last:border-0"
                    // Keep focus on the input: a blur here can commit the
                    // half-typed value and re-render this item away before the
                    // click lands.
                    onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
                    onClick={(e: React.MouseEvent) => {
                      e.preventDefault();
                      onSelect?.(x);
                      setShowList(false);
                    }}
                  >
                    {renderer?.(x) ?? x}
                  </a>
                ))}
              </div>
            </div>
          )}
        </>
      </div>
    </div>
  );
}
