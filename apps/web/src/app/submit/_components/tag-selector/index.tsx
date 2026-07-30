import { SUBMIT_TAG_MAX_LENGTH } from "@/app/submit/_consts";
import { error, SuggestionList } from "@/features/shared";
import { getTrendingTagsQueryOptions } from "@ecency/sdk";
import { useInfiniteQuery } from "@tanstack/react-query";
import { FormControl } from "@ui/input";
import { closeSvg } from "@ui/svg";
import i18next from "i18next";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ItemInterface, ReactSortable } from "react-sortablejs";
import usePrevious from "react-use/lib/usePrevious";
import "./_index.scss";

const specialCharMap: Record<string, string> = {
  æ: "ae",
  œ: "oe",
  ß: "ss",
  ø: "o",
  đ: "d",
  ł: "l",
  ð: "d",
  þ: "th"
};

const specialCharRegex = new RegExp(`[${Object.keys(specialCharMap).join("")}]`, "g");

export function sanitizeTagInput(input: string) {
  const normalized = input.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const lowerCased = normalized.toLowerCase();

  const transliterated = lowerCased.replace(specialCharRegex, (char) => specialCharMap[char] ?? "");

  return transliterated
    .replace(/[,#]/g, " ")
    .replace(/[^a-z0-9-\s]/g, "")
    .replace(/\s+/g, " ")
    .trimStart();
}

interface Props {
  tags: string[];
  maxItem: number;
  onChange: (tags: string[]) => void;
}

export function TagSelector({ tags, onChange, maxItem }: Props) {
  const { data: trendingTagsPages } = useInfiniteQuery(getTrendingTagsQueryOptions(250));
  const trendingTags = useMemo(() => trendingTagsPages?.pages[0] ?? [], [trendingTagsPages?.pages]);

  const [hasFocus, setHasFocus] = useState(false);
  const [value, setValue] = useState("");
  const [warning, setWarning] = useState("");

  const sanitizeInput = useCallback(sanitizeTagInput, []);

  const placeholder = useMemo(
    () =>
      tags && tags.length > 0
        ? i18next.t("tag-selector.placeholder-has-tags")
        : hasFocus
          ? i18next.t("tag-selector.placeholder-focus")
          : i18next.t("tag-selector.placeholder-empty"),
    [hasFocus, tags]
  );

  let suggestions = useMemo(
    () =>
      value
        ? trendingTags
            .filter((x: string) => x.length <= SUBMIT_TAG_MAX_LENGTH)
            .filter((x: string) => x.toLowerCase().indexOf(value.toLowerCase()) === 0)
            .filter((x: string) => !tags.includes(x))
            .slice(0, 40)
        : [],
    [tags, trendingTags, value]
  );

  const focusInput = useCallback(() => {
    const input = document.getElementById("the-tag-input");
    input?.focus();
  }, []);
  const onFocus = useCallback(() => setHasFocus(true), []);
  const filter = useCallback((cats: string[]) => {
    cats.length > 10
      ? setWarning(i18next.t("tag-selector.limited_tags"))
      : cats.find((c) => c.length > SUBMIT_TAG_MAX_LENGTH)
        ? setWarning(i18next.t("tag-selector.limited_length"))
        : cats.find((c) => c.split("-").length > 2)
          ? setWarning(i18next.t("tag-selector.limited_dash"))
          : cats.find((c) => c.indexOf(",") >= 0)
            ? setWarning(i18next.t("tag-selector.limited_space"))
            : cats.find((c) => /[A-Z]/.test(c))
              ? setWarning(i18next.t("tag-selector.limited_lowercase"))
              : cats.find((c) => !/^[a-z0-9-#]+$/.test(c))
                ? setWarning(i18next.t("tag-selector.limited_characters"))
                : cats.find((c) => !/^[a-z-#]/.test(c))
                  ? setWarning(i18next.t("tag-selector.limited_firstchar"))
                  : cats.find((c) => !/[a-z0-9]$/.test(c))
                    ? setWarning(i18next.t("tag-selector.limited_lastchar"))
                    : setWarning("");
  }, []);
  const add = useCallback(
    (value: string): boolean => {
      if (value === "") {
        return false;
      }

      const trimmedValue = value.slice(0, SUBMIT_TAG_MAX_LENGTH);

      if (trimmedValue === "") {
        return false;
      }

      if (tags.includes(trimmedValue)) {
        return false;
      }

      if (tags.length >= maxItem) {
        error(i18next.t("tag-selector.error-max", { n: maxItem }));
        return false;
      }

      const newTags = [...tags, trimmedValue];
      onChange(newTags);
      setValue("");
      return true;
    },
    [maxItem, onChange, tags]
  );
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pastedText = sanitizeInput(e.clipboardData.getData("Text"));

      // Normalize delimiters to space, then split
      const rawTags = pastedText.trim().split(/\s+/);
      const newTags = rawTags
        .map((tag) => tag.slice(0, SUBMIT_TAG_MAX_LENGTH))
        .filter((tag) => !!tag);

      const finalTags = [...tags];

      for (const tag of newTags) {
        if (finalTags.length >= maxItem) {
          break;
        }

        if (finalTags.includes(tag)) {
          continue;
        }

        finalTags.push(tag);
      }

      onChange(finalTags.slice(0, maxItem));
      setValue(""); // clear input
    },
    [tags, maxItem, onChange, sanitizeInput]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (
        (13 === e.which || 13 === e.keyCode || 13 === e.charCode || "Enter" === e.key) &&
        warning === ""
      ) {
        e.preventDefault();
        add(value);
      }
    },
    [add, value, warning]
  );
  const deleteFn = useCallback(
    (tag: string) => {
      const newTags = tags.filter((x) => x !== tag);
      onChange(newTags);
    },
    [onChange, tags]
  );
  const onSort = useCallback(
    (items: ItemInterface[]) => {
      const newTags = items.map((x: ItemInterface) => x.name);
      onChange(newTags);
    },
    [onChange]
  );
  const onChangeFn = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const sanitizedValue = sanitizeInput(e.target.value);
      const value = sanitizedValue.trim();
      const cats = value === "" ? [] : value.split(/\s+/);

      if (cats.length > 0) {
        const normalizedCats = cats.map((cat) => cat.slice(0, SUBMIT_TAG_MAX_LENGTH));
        filter(normalizedCats);
        setValue(normalizedCats.join(""));
      } else {
        setValue("");
      }

      if (e.target.value.endsWith(" ") || e.target.value.endsWith(",")) {
        e.preventDefault();
        add(value);
      }
    },
    [add, filter, sanitizeInput]
  );
  const onBlur = useCallback(() => {
    setHasFocus(false);
    // Same gate Enter already applies. Without it, a tag the warning has just
    // rejected ("abc-", a leading digit, a second dash) was still committed by
    // clicking away, so invalid tags reached publish - the warning was advice
    // on one path and a rule on the other.
    if (warning === "") {
      add(value);
    }
  }, [add, value, warning]);

  return (
    <>
      <div
        id="submit-tags-selector"
        className={`tag-selector ${tags.length > 0 ? "has-tags" : ""}`}
      >
        <SuggestionList
          renderer={(x: string) => {
            return (
              <>
                <span
                  aria-hidden={true}
                  className="inline-flex shrink-0 items-center justify-center size-4 leading-none"
                >
                  #
                </span>
                {x}
              </>
            );
          }}
          items={suggestions}
          listStyle={{
            top: "0"
          }}
          header={i18next.t("tag-selector.suggestion-header")}
          onSelect={(value: string) => {
            if (add(value)) {
              focusInput();
            }
          }}
        >
          <FormControl
            type="text"
            noStyles={true}
            className="form-control px-3 py-1 w-full outline-none shadow-0"
            onFocus={onFocus}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            tabIndex={0}
            onChange={onChangeFn}
            value={value}
            maxLength={24}
            onPaste={handlePaste}
            placeholder={placeholder}
            autoComplete="off"
            id="the-tag-input"
            spellCheck={true}
          />
        </SuggestionList>
        {warning && <span className="warning">{warning}</span>}
        {tags.length > 0 && (
          <ReactSortable
            animation={200}
            swapThreshold={1}
            ghostClass="tag-item-ghost"
            className="tag-list"
            list={[...tags.map((x) => ({ id: x, name: x }))]}
            setList={onSort}
            handle=".item-inner"
          >
            {tags.map((x) => {
              return (
                <div key={x} className="tag-item">
                  <div className="item-inner">
                    <span>{x}</span>
                  </div>
                  <span
                    className="item-delete [&>svg]:size-4"
                    role="button"
                    tabIndex={0}
                    aria-label={i18next.t("g.delete", { defaultValue: "Delete" })}
                    onClick={() => deleteFn(x)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        deleteFn(x);
                      }
                    }}
                  >
                    {closeSvg}
                  </span>
                </div>
              );
            })}
          </ReactSortable>
        )}
      </div>
    </>
  );
}
