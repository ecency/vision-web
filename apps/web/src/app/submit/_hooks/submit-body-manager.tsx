import React, { createContext, PropsWithChildren, useContext, useMemo, useState } from "react";

interface SubmitBodyContextValue {
  body: string;
  setBody: (value: string) => void;
}

const SubmitBodyContext = createContext<SubmitBodyContextValue>({
  body: "",
  setBody: () => {}
});

export function useSubmitBody() {
  return useContext(SubmitBodyContext);
}

/**
 * Holds the post body for the classic editor.
 *
 * This replaces a "body versioning" queue that md5-hashed the entire body on
 * every keystroke and retained up to 100 full copies of it, so that undoing
 * past a removed video could restore the metadata attached to that revision.
 * Nothing ever read it: no caller passed the `onVersionChange` callback, and
 * neither `activeQueueItem` nor `updateMetadata` had a consumer anywhere in the
 * app. It was per-keystroke CPU and unbounded retention of the post text for a
 * feature that was never wired up.
 */
export function SubmitBodyProvider({ children }: PropsWithChildren<unknown>) {
  const [body, setBody] = useState("");

  // The old provider rebuilt this object on every render, so every consumer
  // re-rendered on any parent render whether the body changed or not.
  const value = useMemo(() => ({ body, setBody }), [body]);

  return <SubmitBodyContext.Provider value={value}>{children}</SubmitBodyContext.Provider>;
}
