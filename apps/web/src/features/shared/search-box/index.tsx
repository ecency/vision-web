import React from "react";
import { FormControl, InputGroup } from "@ui/input";
import { Button } from "@ui/button";
import { copyContent } from "@/features/ui/svg";
import { searchIconSvg } from "@/features/ui/icons";
import { useCopyToClipboard } from "react-use";

type Props = any;

export function SearchBox({ showcopybutton, value, username, filter, ...other }: Props) {
  const [_, copy] = useCopyToClipboard();
  const searchValue =
    typeof value === "string"
      ? value
      : typeof value === "number"
        ? value.toString()
        : value ?? "";

  const buildCopyUrl = () => {
    const normalizedUsername =
      typeof username === "string" && username.length > 0 ? username.replace(/^\//, "") : "";
    const normalizedFilter =
      typeof filter === "string" && filter.length > 0 ? filter.replace(/^\//, "") : "";

    const pathSegments = [normalizedUsername, normalizedFilter].filter(Boolean);
    const basePath = pathSegments.length > 0 ? `/${pathSegments.join("/")}` : "";
    const query = searchValue.length > 0 ? `?q=${encodeURIComponent(searchValue)}` : "";

    return `https://ecency.com${basePath}${query}`;
  };

  return (
    <div className="search-box">
      {showcopybutton ? (
        <div className="flex focus-input">
          <InputGroup
            append={
              <Button
                disabled={searchValue.length === 0}
                onClick={() => copy(buildCopyUrl())}
              >
                <div className="w-4 flex">{copyContent}</div>
              </Button>
            }
          >
            <FormControl
              type="text"
              {...{ ...other, value: searchValue, username, filter }}
              className={"input-with-copy rounded-r"}
              autoComplete="off"
            />
          </InputGroup>
        </div>
      ) : (
        <InputGroup
          prepend={
            <span className="inline-flex !size-5 [&>svg]:size-full">{searchIconSvg}</span>
          }
        >
          <FormControl type="text" {...{ ...other, value: searchValue, username, filter }} />
        </InputGroup>
      )}
    </div>
  );
}
