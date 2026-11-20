import { computePosition, flip, type ReferenceElement } from "@floating-ui/dom";

export interface SuggestionPositionProps {
  decorationNode?: Element | null;
  clientRect?: (() => DOMRect | null) | null;
}

/**
 * Pick something floating-ui can measure for a TipTap suggestion popup.
 *
 * TipTap looks the suggestion decoration up in the editor DOM, so
 * `decorationNode` is null (or detached) whenever the decoration is not
 * rendered at that moment, e.g. while the Android IME is composing. Passing
 * that straight to computePosition rejects with "Cannot read properties of
 * null (reading 'getBoundingClientRect')".
 */
export function getSuggestionReference(props: SuggestionPositionProps): ReferenceElement | null {
  const node = props.decorationNode;
  if (node && node.isConnected) {
    return node;
  }

  const rect = props.clientRect?.() ?? null;
  if (rect) {
    return { getBoundingClientRect: () => rect };
  }

  return null;
}

/**
 * Position a suggestion popup under its decoration. Skips the update when
 * there is nothing to anchor to; the next suggestion update repositions it.
 */
export function positionSuggestionPopup(
  props: SuggestionPositionProps,
  floating: HTMLElement
): Promise<void> {
  const reference = getSuggestionReference(props);
  if (!reference || !floating.isConnected) {
    return Promise.resolve();
  }

  return computePosition(reference, floating, {
    middleware: [flip()]
  }).then(
    ({ x, y }) => {
      if (!floating.isConnected) {
        return;
      }
      Object.assign(floating.style, {
        left: `${x}px`,
        top: `${y}px`
      });
    },
    (error) => {
      // The popup was torn down while measuring: nothing left to position.
      if (!floating.isConnected) {
        return;
      }
      throw error;
    }
  );
}
