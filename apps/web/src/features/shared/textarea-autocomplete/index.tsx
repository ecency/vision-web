import React, {
  forwardRef,
  MutableRefObject,
  useEffect,
  useState
} from "react";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import ReactTextareaAutocomplete from "@webscopeio/react-textarea-autocomplete";
import { lookupAccountsQueryOptions, searchPath } from "@ecency/sdk";
import { UserAvatar } from "@/features/shared";
import i18next from "i18next";
import { useIsMobile } from "@/utils";
import { useQueryClient } from "@tanstack/react-query";

const Loading = () => <div>{i18next.t("g.loading")}</div>;

let timer: any = null;

// eslint-disable-next-line react/display-name
export const TextareaAutocomplete = forwardRef<HTMLTextAreaElement, any>((props, ref) => {
  const { activeUser } = useActiveAccount();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const [value, setValue] = useState(props.value);
  const [rows, setRows] = useState(props.minrows || 10);
  const [minrows, setMinrows] = useState(props.minrows || 10);
  const [maxrows, setMaxrows] = useState(props.maxrows || 20);

  const { rows: propRows, isComment, disableRows, ...other } = props;
  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 992;
  const attrs = { ...other };

  if ((!disableRows || !isDesktop) && typeof window !== "undefined") {
    attrs.rows = isComment ? rows : rows;
  }

  useEffect(() => {
    setValue(props.value);
  }, [props.value, value]);

  const handleChange = (event: any) => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 570;
    if (isMobile) {
      const textareaLineHeight = 24;

      const previousRows = event.target.rows;
      event.target.rows = minrows; // reset number of rows in textarea

      const currentRows = ~~(event.target.scrollHeight / textareaLineHeight);

      if (currentRows === previousRows) {
        event.target.rows = currentRows;
      }

      if (currentRows >= maxrows) {
        event.target.rows = maxrows;
        event.target.scrollTop = event.target.scrollHeight;
      }
      setRows(currentRows < maxrows ? currentRows : maxrows);
    }

    setValue(event.target.value);
    props.onChange(event);
  };

  return (
    <ReactTextareaAutocomplete
      {...attrs}
      innerRef={(el) => {
        if (typeof ref === "function") {
          ref(el);
        } else if (ref) {
          (ref as MutableRefObject<HTMLTextAreaElement | null>).current = el;
        }
      }}
      loadingComponent={Loading}
      value={value}
      placeholder={props.placeholder}
      onChange={handleChange}
      {...(isComment ? {} : { boundariesElement: ".body-input" })}
      minChar={2}
      dropdownStyle={{ zIndex: 14 }}
      trigger={{
        ["@"]: {
          dataProvider: (token) => {
            clearTimeout(timer);
            return new Promise((resolve) => {
              timer = setTimeout(async () => {
                if (token.includes("/")) {
                  let ignoreList = [
                    "engine",
                    "wallet",
                    "points",
                    "communities",
                    "settings",
                    "permissions",
                    "comments",
                    "replies",
                    "blog",
                    "posts",
                    "feed",
                    "referrals",
                    "followers",
                    "following"
                  ];
                  let searchIsInvalid = ignoreList.some((item) => token.includes(`/${item}`));
                  if (!searchIsInvalid) {
                    // No suggestions is the only sensible answer to a failed lookup,
                    // and this promise has no rejection handler: the executor runs
                    // inside a setTimeout, so anything thrown here escapes as an
                    // unhandled rejection rather than reaching the caller.
                    searchPath(token)
                      .then((resp) => resolve(resp))
                      .catch(() => resolve([]));
                  } else {
                    resolve([]);
                  }
                } else {
                  try {
                    const suggestions = await queryClient.fetchQuery(
                      lookupAccountsQueryOptions(token.toLowerCase(), 5)
                    );
                    resolve(suggestions);
                  } catch {
                    resolve([]);
                  }
                }
              }, 300);
            });
          },
          component: (props: any) => {
            let textToShow: string = props.entity.includes("/")
              ? props.entity.split("/")[1]
              : props.entity;
            let charLimit = isMobile ? 16 : 30;
            if (textToShow.length > charLimit && props.entity.includes("/")) {
              textToShow =
                textToShow.substring(0, charLimit - 5) +
                "..." +
                textToShow.substring(textToShow.length - 6, textToShow.length - 1);
            }

            return (
              <>
                {props.entity.includes("/") ? null : (
                  <UserAvatar username={props.entity} size="small" />
                )}
                <span style={{ marginLeft: "8px" }}>{textToShow}</span>
              </>
            );
          },
          output: (item: any, trigger) => `@${item}`
        }
      }}
    />
  );
});
