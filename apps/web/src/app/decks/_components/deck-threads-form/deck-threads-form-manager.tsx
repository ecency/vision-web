import React, { createContext, JSX, useState } from "react";
import { getAccountPostsQueryOptions } from "@ecency/sdk";
import { useDataLimit } from "@/utils/data-limit";
import { useCommunityApi, useThreadsApi } from "./api";
import { ThreadItemEntry } from "../columns/deck-threads-manager";
import { Entry } from "@/entities";
import { ProfileFilter } from "@/enums";
import i18next from "i18next";
import { error } from "@/features/shared";
import { formatError } from "@/api/format-error";
import { reportRcRejection } from "@/api/rc-shortfall-report";
import { useActiveUsername } from "@/core/hooks/use-active-username";
import { useQueryClient } from "@tanstack/react-query";

interface Context {
  show: boolean;
  setShow: (v: boolean) => void;
  create: (host: string, raw: string, entry?: ThreadItemEntry) => Promise<Entry>;
  createReply: (parent: Entry, raw: string, entry?: ThreadItemEntry) => Promise<Entry>;
}

export const DeckThreadsFormContext = createContext<Context>({
  show: false,
  setShow: () => {},
  create: async () => ({}) as Entry,
  createReply: async () => ({}) as Entry
});

interface Props {
  children: (context: Context) => JSX.Element | JSX.Element[];
}

export const DeckThreadsFormManager = ({ children }: Props) => {
  const { request: generalApiRequest } = useThreadsApi();
  const { request: communityBasedApiRequest } = useCommunityApi();
  const queryClient = useQueryClient();
  const dataLimit = useDataLimit();
  const username = useActiveUsername();

  const [show, setShow] = useState(false);

  const createThreadItem = async (host: string, raw: string, editingEntry?: ThreadItemEntry) => {
    try {
      if (host === "dbuzz") {
        return await communityBasedApiRequest(host, raw, editingEntry);
      }

      const hostEntries = await queryClient.fetchQuery(
        getAccountPostsQueryOptions(host, ProfileFilter.posts, "", "", dataLimit)
      );

      if (!hostEntries) {
        throw new Error(i18next.t("decks.threads-form.no-threads-host"));
      }

      const entry = hostEntries[0];
      return await generalApiRequest(entry, raw, editingEntry);
    } catch (e) {
      // dbuzz threads are root posts; every other host takes a reply.
      reportRcRejection(e, host === "dbuzz" ? "post" : "comment", username);
      error(...formatError(e));
      throw e;
    }
  };

  const replyToThreadItem = async (parent: Entry, raw: string, editingEntry?: ThreadItemEntry) => {
    try {
      return await generalApiRequest(parent, raw, editingEntry);
    } catch (e) {
      reportRcRejection(e, "comment", username);
      error(...formatError(e));
      throw e;
    }
  };

  return (
    <DeckThreadsFormContext.Provider
      value={{
        show,
        setShow,
        create: createThreadItem,
        createReply: replyToThreadItem
      }}
    >
      {children({
        show,
        setShow,
        create: createThreadItem,
        createReply: replyToThreadItem
      })}
    </DeckThreadsFormContext.Provider>
  );
};
