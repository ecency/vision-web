import i18next from "i18next";
import { FormControl } from "@ui/input";
import { Button } from "@ui/button";
import React, { useEffect, useState } from "react";
import {
  buildSearchQuery,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_SEARCH_TAGS,
  SearchQuery,
  SearchType
} from "@ecency/sdk";
import { DateOpt } from "@/enums";
import { SearchSort } from "@/app/decks/_components/consts";
import { ReadonlyURLSearchParams, useRouter, useSearchParams } from "next/navigation";

interface FormValues {
  search: string;
  author: string;
  type: SearchType;
  category: string;
  tags: string;
  date: DateOpt;
  sort: SearchSort;
  hideLow: boolean;
  includeNsfw: boolean;
}

function enumValue<T extends Record<string, string>>(
  e: T,
  value: string | null | undefined,
  fallback: T[keyof T]
): T[keyof T] {
  return Object.values(e).includes(value as string) ? (value as T[keyof T]) : fallback;
}

function readFormValues(params: ReadonlyURLSearchParams | null): FormValues {
  const searchQuery = new SearchQuery(params?.get("q") ?? "");

  return {
    // The tokens are shown in their own fields, so the free text field gets the
    // stripped remainder. Seeding it with the raw query re-appended every filter
    // on each apply until q blew past the API's length cap.
    search: searchQuery.search,
    author: searchQuery.author,
    type: searchQuery.type,
    category: searchQuery.category,
    tags: searchQuery.tags.join(","),
    date: enumValue(DateOpt, params?.get("date"), DateOpt.A),
    sort: enumValue(SearchSort, params?.get("sort"), SearchSort.RELEVANCE),
    hideLow: params?.get("hd") !== "0",
    includeNsfw: params?.get("nsfw") === "1"
  };
}

export function SearchAdvancedForm() {
  const router = useRouter();
  const params = useSearchParams();

  // Seeded on the first render rather than from an effect, otherwise every
  // mount painted the defaults before the URL values replaced them - visible as
  // the hide-low checkbox flashing unchecked.
  const [initialValues] = useState(() => readFormValues(params));

  const [search, setSearch] = useState(initialValues.search);
  const [author, setAuthor] = useState(initialValues.author);
  const [type, setType] = useState<SearchType>(initialValues.type);
  const [category, setCategory] = useState(initialValues.category);
  const [tags, setTags] = useState(initialValues.tags);
  // Deliberately component state: this used to be the "recent_date" localStorage
  // entry shared with the decks add-column form, so the two features overwrote
  // each other and an untouched select silently reapplied a stale value.
  const [date, setDate] = useState<DateOpt>(initialValues.date);
  const [sort, setSort] = useState<SearchSort>(initialValues.sort);
  const [hideLow, setHideLow] = useState(initialValues.hideLow);
  const [includeNsfw, setIncludeNsfw] = useState(initialValues.includeNsfw);
  const [error, setError] = useState("");

  useEffect(() => {
    // Keep the panel in sync when the URL changes under it - navbar search,
    // browser history. On mount these all match the seeded values.
    const values = readFormValues(params);
    setSearch(values.search);
    setAuthor(values.author);
    setType(values.type);
    setCategory(values.category);
    setTags(values.tags);
    setDate(values.date);
    setSort(values.sort);
    setHideLow(values.hideLow);
    setIncludeNsfw(values.includeNsfw);
    // The fields the message pointed at are gone, so the message goes with them.
    setError("");
  }, [params]);

  const searchChanged = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setError("");
    setSearch(e.target.value);
  };
  // No trimming while typing on the filter fields - it makes a trailing space
  // impossible to type. They are normalized when the query is built instead.
  const authorChanged = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setError("");
    setAuthor(e.target.value);
  };
  const typeChanged = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setError("");
    setType(e.target.value as SearchType);
  };
  const categoryChanged = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setError("");
    setCategory(e.target.value);
  };
  const tagsChanged = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setError("");
    setTags(e.target.value);
  };
  const dateChanged = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setError("");
    setDate(e.target.value as DateOpt);
  };
  const sortChanged = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    setError("");
    setSort(e.target.value as SearchSort);
  };

  const textInputDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      apply();
    }
  };

  const apply = () => {
    const built = buildSearchQuery({ search, author, type, category, tags });
    // The free text field can hold token syntax of its own ("author:@Demo",
    // "tag:a,b,c"), which both parsers read back as a filter. Re-parsing and
    // rebuilding normalizes those tokens the same way the dedicated fields are
    // normalized, makes the guards below measure what is actually sent, and
    // keeps build -> parse -> rebuild a fixed point - without it the same
    // search missed on the first Apply and matched on the second.
    const parsed = new SearchQuery(built.q);
    const effective = buildSearchQuery({
      search: parsed.search,
      // The API keeps only the FIRST author:/type:/category: match, and the
      // free text is placed ahead of the fields, so a token typed there would
      // otherwise silently override the field the user filled in. Filling a
      // field in is the more deliberate signal, so it wins; the token is used
      // only when its field is empty. Tags are different on purpose: the API
      // joins every tag: match, so both sources combine.
      author: built.author || parsed.author,
      type: built.type || parsed.type,
      category: built.category || parsed.category,
      tags: parsed.tags
    });

    // A filter with no free text is a valid search ("everything by @user"), but
    // a bare type: is not selective enough and the API rejects it.
    if (!effective.search && !effective.author && !effective.category && effective.tags.length === 0) {
      setError(i18next.t("search-comment.error-no-criteria"));
      return;
    }

    if (effective.tags.length > MAX_SEARCH_TAGS) {
      setError(i18next.t("search-comment.error-too-many-tags", { n: MAX_SEARCH_TAGS }));
      return;
    }

    if (effective.q.length > MAX_SEARCH_QUERY_LENGTH) {
      setError(i18next.t("search-comment.error-too-long", { n: MAX_SEARCH_QUERY_LENGTH }));
      return;
    }

    setError("");

    const nextParams = new URLSearchParams();
    nextParams.append("q", effective.q);
    nextParams.append("date", date);
    nextParams.append("sort", sort);
    nextParams.append("adv", "1");
    if (!hideLow) nextParams.append("hd", "0");
    if (includeNsfw) nextParams.append("nsfw", "1");
    router.push(`?${nextParams.toString()}`);
  };

  return (
    <div className="advanced-section">
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-4 mb-4">
          <label>{i18next.t("search-comment.search")}</label>
          <FormControl
            type="text"
            placeholder={i18next.t("search-comment.search-placeholder")}
            value={search}
            onChange={searchChanged}
            onKeyDown={textInputDown}
          />
        </div>
        <div className="col-span-12 sm:col-span-4 mb-4">
          <label>{i18next.t("search-comment.author")}</label>
          <FormControl
            type="text"
            placeholder={i18next.t("search-comment.author-placeholder")}
            value={author}
            onChange={authorChanged}
            onKeyDown={textInputDown}
          />
        </div>
        <div className="col-span-12 sm:col-span-2 mb-4">
          <label>{i18next.t("search-comment.type")}</label>
          <FormControl type="select" value={type} onChange={typeChanged} onKeyDown={textInputDown}>
            {Object.values(SearchType).map((x) => (
              <option value={x} key={x}>
                {i18next.t(`search-comment.type-${x}`)}
              </option>
            ))}
          </FormControl>
        </div>
        <div className="col-span-12 sm:col-span-2 mb-4">
          <label>{i18next.t("search-comment.category")}</label>
          <FormControl
            type="text"
            placeholder={i18next.t("search-comment.category-placeholder")}
            value={category}
            onChange={categoryChanged}
            onKeyDown={textInputDown}
          />
        </div>
      </div>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-8 mb-4">
          <label>{i18next.t("search-comment.tags")}</label>
          <FormControl
            type="text"
            placeholder={i18next.t("search-comment.tags-placeholder")}
            value={tags}
            onChange={tagsChanged}
            onKeyDown={textInputDown}
          />
        </div>
        <div className="col-span-12 sm:col-span-2 mb-4">
          <label>{i18next.t("search-comment.date")}</label>
          <FormControl type="select" value={date} onChange={dateChanged} onKeyDown={textInputDown}>
            {Object.values(DateOpt).map((x) => (
              <option value={x} key={x}>
                {i18next.t(`search-comment.date-${x}`)}
              </option>
            ))}
          </FormControl>
        </div>
        <div className="col-span-12 sm:col-span-2 mb-4">
          <label>{i18next.t("search-comment.sort")}</label>
          <FormControl type="select" value={sort} onChange={sortChanged} onKeyDown={textInputDown}>
            {Object.values(SearchSort).map((x) => (
              <option value={x} key={x}>
                {i18next.t(`search-comment.sort-${x}`)}
              </option>
            ))}
          </FormControl>
        </div>
      </div>
      <div className="flex justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <FormControl
            id="hide-low"
            type="checkbox"
            label={i18next.t("search-comment.hide-low")}
            checked={hideLow}
            onChange={(v) => {
              setError("");
              setHideLow(v);
            }}
          />
          <FormControl
            id="include-nsfw"
            type="checkbox"
            label={i18next.t("search-comment.include-nsfw")}
            checked={includeNsfw}
            onChange={(v) => {
              setError("");
              setIncludeNsfw(v);
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          {error && (
            <div className="text-sm text-red-500" role="alert">
              {error}
            </div>
          )}
          <Button onClick={apply}>{i18next.t("g.apply")}</Button>
        </div>
      </div>
    </div>
  );
}
