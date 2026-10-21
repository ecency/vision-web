import { getQueryClient } from "@/core/react-query";
import { UserAvatar } from "@/features/shared";
import { getSearchAccountsByUsernameQueryOptions } from "@ecency/sdk";
import { computePosition, flip } from "@floating-ui/dom";
import { ReactRenderer } from "@tiptap/react";
import { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import clsx from "clsx";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export const USER_MENTION_PURE_REGEX =
  /@(?=[a-zA-Z][a-zA-Z0-9.-]{1,15}\b)[a-zA-Z][a-zA-Z0-9-]{2,}(?:\.[a-zA-Z][a-zA-Z0-9-]{2,})*\b/gi;
export const USER_MENTION_SPAN_REGEX =
  /<span[^>]*data-type="mention"[^>]*>@([a-zA-Z0-9\-\.]*)<\/span>/gi;

const MentionList = forwardRef<
  { onKeyDown: (props: SuggestionKeyDownProps) => boolean },
  SuggestionProps<string, { id: string }>
>(
  function MentionListForwarded({ items: incomingItems, command, loading }, ref) {
    // TipTap 3 sends items: [] with loading: true on every new query, before
    // items() resolves. Keep showing the last results meanwhile, as TipTap 2
    // did, but do not let them be picked: they belong to the previous query.
    const lastItems = useRef(incomingItems);
    if (!loading) {
      lastItems.current = incomingItems;
    }
    const items = loading ? lastItems.current : incomingItems;
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      if (loading) {
        return;
      }
      const item = items[index];

      if (item) {
        command({ id: item });
      }
    };

    const upHandler = () => {
      setSelectedIndex((selectedIndex + items.length - 1) % items.length);
    };

    const downHandler = () => {
      setSelectedIndex((selectedIndex + 1) % items.length);
    };

    const enterHandler = () => {
      selectItem(selectedIndex);
    };

    useEffect(() => setSelectedIndex(0), [items]);

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }) => {
        // Nothing shown yet: let the editor handle the key.
        if (loading && items.length === 0) {
          return false;
        }

        if (event.key === "ArrowUp") {
          upHandler();
          return true;
        }

        if (event.key === "ArrowDown") {
          downHandler();
          return true;
        }

        if (event.key === "Enter") {
          enterHandler();
          return true;
        }

        return false;
      }
    }));

    // Wait for the first results instead of flashing "No result".
    if (loading && items.length === 0) {
      return null;
    }

    return (
      <div
        className={clsx(
          "animate-scale-in origin-top overflow-hidden flex flex-col items-start border border-[--border-color] rounded-xl bg-white text-sm",
          loading && "opacity-50"
        )}
        aria-busy={loading}
      >
        {items.map((item, index) => (
          <div
            className={clsx(
              "border-b last:border-0 w-full border[--border-color] flex items-center p-2 gap-2 cursor-pointer hover:bg-gray-100 dark:hover-gray-800",
              index === selectedIndex ? "bg-blue-powder dark:bg-dark-default" : ""
            )}
            key={item}
            onClick={() => selectItem(index)}
          >
            <UserAvatar username={item} size="small" />
            {item}
          </div>
        ))}
        {items.length == 0 && <div className="p-2 opacity-50">No result</div>}
      </div>
    );
  }
);

export const UserMentionExtensionConfig = {
  items: async ({ query }: { query: string }) => {
    const options = getSearchAccountsByUsernameQueryOptions(query);

    await getQueryClient()?.prefetchQuery({ ...options, staleTime: 60000 });

    const response = getQueryClient()?.getQueryData(options.queryKey);
    return response ?? [];
  },
  render: () => {
    const placementArea = document.querySelector("#popper-container");
    let reactRenderer: ReactRenderer<any> | null = null;

    const updatePosition = (decorationNode: HTMLElement) => {
      if (!reactRenderer) {
        return;
      }

      const element = reactRenderer.element as HTMLElement;

      computePosition(decorationNode, element, {
        middleware: [flip()]
      }).then(({ x, y }) => {
        Object.assign(element.style, {
          left: `${x}px`,
          top: `${y}px`
        });
      });
    };

    return {
      onStart: (props: any) => {
        if (!props.clientRect) {
          return;
        }

        reactRenderer = new ReactRenderer(MentionList, {
          props,
          editor: props.editor,
          className: "absolute"
        });

        placementArea?.appendChild(reactRenderer.element);

        updatePosition(props.decorationNode as HTMLElement);
      },

      onUpdate(props: any) {
        if (!reactRenderer) {
          return;
        }

        reactRenderer.updateProps(props);

        updatePosition(props.decorationNode as HTMLElement);
      },

      onKeyDown(props: any) {
        if (props.event.key === "Escape") {
          reactRenderer?.element?.classList.add("hidden");
          return true;
        }

        return reactRenderer?.ref?.onKeyDown(props);
      },

      onExit() {
        if (reactRenderer) {
          reactRenderer.destroy();
          reactRenderer = null;
        }
      }
    };
  }
};
