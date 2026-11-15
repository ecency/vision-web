import type { Root } from "react-dom/client";

/**
 * Unmounts the given roots after the current task. The extensions tear their
 * roots down from an effect cleanup, which can run while React is rendering
 * (a parent re-render, Strict Mode's double setup), and a synchronous
 * root.unmount() there logs "Attempted to synchronously unmount a root while
 * React was already rendering". The roots' containers are detached by the
 * caller right away, so nothing they render stays on screen meanwhile.
 */
export function unmountRootsLater(roots: Root[]): void {
  if (roots.length === 0) return;
  const pending = [...roots];
  queueMicrotask(() => {
    for (const root of pending) {
      root.unmount();
    }
  });
}
