import React, {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { SearchBox } from "@/features/shared";
import Image from "next/image";
import { insertOrReplace } from "@/utils/input-util";
import { classNameObject } from "@ui/util";
import i18next from "i18next";
import { getGifsQuery } from "@/api/queries";
import { useInfiniteDataFlow } from "@/utils";
import { GifPickerBottom } from "./gif-picker-bottom";
import { useInfiniteQuery } from "@tanstack/react-query";

interface Props {
  fallback?: (e: string) => void;
  shGif: boolean;
  changeState: (gifState?: boolean) => void;
  pureStyle?: boolean;
  style?: {
    width: string;
    bottom: string;
    left: string | number;
    marginLeft: string;
    borderTopLeftRadius: string;
    borderTopRightRadius: string;
    borderBottomLeftRadius: string;
  };
  gifImagesStyle?: {
    width: string;
  };
  rootRef?: MutableRefObject<HTMLDivElement | null>;
}

export function GifPicker(props: Props) {
  const internalRootRef = useRef<HTMLDivElement | null>(null);
  const rootRef = props.rootRef ?? internalRootRef;
  const targetRef = useRef<HTMLInputElement | null>(null);

  const [filter, setFilter] = useState("");

  const { data, refetch, fetchNextPage, hasNextPage } = useInfiniteQuery(getGifsQuery(filter));
  const dataFlow = useInfiniteDataFlow(data);

  useEffect(() => {
    refetch();
  }, [filter, refetch]);

  const itemClicked = useCallback(
    async (url: string, _filter?: string | any) => {
      const gifTitles: string[] = dataFlow.map((i) => i.title);
      const selectedGifTitle = gifTitles[0];
      let _url = url.split(".gif");
      let gifUrl = `![${selectedGifTitle}](${_url[0]}.gif)`;
      if (targetRef.current) {
        insertOrReplace(targetRef.current, gifUrl);
      } else {
        props.fallback?.(gifUrl);
      }
      props.changeState(!props.shGif);
    },
    [dataFlow, props]
  );

  const mergedStyle = useMemo(
    () => ({
      position: "fixed" as const,
      right: "auto",
      ...props.style
    }),
    [props.style]
  );

  useEffect(() => {
    if (!props.shGif) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const targetNode = event.target as Node | null;

      if (!targetNode) {
        return;
      }

      if (rootRef.current?.contains(targetNode)) {
        return;
      }

      props.changeState(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [props.changeState, props.shGif]);

  return (
    <div
      ref={rootRef}
      className={classNameObject({
        "gif-picker": true,
        "emoji-picker gif": !props.pureStyle
      })}
      style={mergedStyle}
    >
      <SearchBox
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        value={filter}
        placeholder={i18next.t("gif-picker.filter-placeholder")}
        onChange={(e: { target: { value: React.SetStateAction<string> } }) =>
          setFilter(e.target.value)
        }
      />
      <div className="gif-cat-list gif-cat-list" id="gif-wrapper">
        <div className="gif-cat gif-cat">
          <div className="gif-list gif-list">
            {dataFlow.map((gif, i) => (
              <div className="emoji gifs" key={gif?.id || i}>
                <Image
                  style={{
                    width: "200px",
                    ...(props.gifImagesStyle && props.gifImagesStyle)
                  }}
                  width={200}
                  height={200}
                  loading="lazy"
                  src={gif?.images?.fixed_height?.url}
                  alt="can't fetch :("
                  onClick={() => itemClicked(gif?.images?.fixed_height?.url)}
                />
              </div>
            ))}
            <GifPickerBottom onVisible={() => hasNextPage && fetchNextPage()} />
          </div>
        </div>
      </div>
      <span className="flex justify-end">{i18next.t("gif-picker.credits")}</span>
    </div>
  );
}
