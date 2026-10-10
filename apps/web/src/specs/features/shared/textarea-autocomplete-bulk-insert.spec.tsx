import React, { useEffect, useRef, useState } from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { insertOrReplace } from "@/utils/input-util";

// The autocomplete library is not mocked, so the component runs as shipped.
vi.mock("@/core/hooks/use-active-account", () => ({
  useActiveAccount: () => ({ activeUser: null })
}));
vi.mock("@ecency/sdk", () => ({ lookupAccountsQueryOptions: vi.fn(), searchPath: vi.fn() }));
vi.mock("@/features/shared", () => ({ UserAvatar: () => null }));
vi.mock("@/utils", () => ({ useIsMobile: () => false }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({}) }));

import { TextareaAutocomplete } from "@/features/shared/textarea-autocomplete";

const placeholder = (i: number) => `![Uploading image-${i}.png]()\n\n`;

// What the parent saw: every change it was told about and the text it holds.
const parent = { changes: 0, text: "" };

// A parent that owns the text, as the comment box and the post editor do, with
// a native paste listener that inserts one placeholder per pasted image the way
// the editor toolbar does.
function Editor({ images }: { images: number }) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  parent.text = text;

  useEffect(() => {
    const el = ref.current!;
    const onPaste = () => {
      for (let i = 0; i < images; i++) {
        insertOrReplace(el as unknown as HTMLInputElement, placeholder(i));
      }
    };
    el.addEventListener("paste", onPaste);
    return () => el.removeEventListener("paste", onPaste);
  }, [images]);

  return (
    <TextareaAutocomplete
      as="textarea"
      value={text}
      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
        parent.changes += 1;
        setText(e.target.value);
      }}
      ref={ref}
      isComment={true}
      minrows={3}
      maxrows={100}
    />
  );
}

describe("TextareaAutocomplete bulk insert", () => {
  it("keeps every placeholder when many images are pasted at once", () => {
    // React gives up after 50 nested updates. Each insert used to add roughly one, so
    // the count has to be comfortably above that for the test to mean anything.
    const images = 80;
    parent.changes = 0;
    parent.text = "";
    const { container } = render(<Editor images={images} />);
    const textarea = container.querySelector("textarea")!;

    act(() => {
      textarea.dispatchEvent(new Event("paste", { bubbles: true }));
    });

    const expected = Array.from({ length: images }, (_, i) => placeholder(i)).join("");
    expect(parent.changes).toBe(images);
    expect(parent.text).toBe(expected);
    expect(textarea.value).toBe(expected);
  });
});
