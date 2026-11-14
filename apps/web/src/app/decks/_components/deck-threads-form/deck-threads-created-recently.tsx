import React, { useContext, useEffect, useState } from "react";
import { DeckThreadsContext } from "../columns/deck-threads-manager";
import { isLocalEntry, useEntryChecking } from "../utils";
import { entryKey } from "@ecency/sdk";
import { Spinner } from "@ui/spinner";
import { Alert } from "@ui/alert";
import { Entry } from "@/entities";
import { checkSvg } from "@ui/svg";
import { EntryLink } from "@/features/shared";
import i18next from "i18next";

interface Props {
  lastEntry?: Entry;
  setLastEntry: (v?: Entry) => void;
}

export const DeckThreadsCreatedRecently = ({ lastEntry, setLastEntry }: Props) => {
  const { reload } = useContext(DeckThreadsContext);

  const [intervalStarted, setIntervalStarted] = useState(false);

  useEntryChecking(lastEntry, intervalStarted, (entry) => {
    setLastEntry(entry);

    // Reload all columns after thread item creation
    reload();

    setTimeout(() => {
      setLastEntry(undefined);
      setIntervalStarted(false);
    }, 5000);
  });

  useEffect(() => {
    if (lastEntry) {
      setIntervalStarted(true);
    }
  }, [lastEntry]);

  return (
    <div className="deck-threads-created-recently">
      {lastEntry && (
        <Alert appearance={!isLocalEntry(lastEntry) ? "success" : "secondary"} key={entryKey(lastEntry)}>
          <div className="flex items-center">
            <div className="icon">
              {!isLocalEntry(lastEntry) ? checkSvg : <Spinner className="size-4" />}
            </div>
            <div className="pl-3">
              {!isLocalEntry(lastEntry)
                ? i18next.t("decks.threads-form.successfully-created")
                : i18next.t("decks.threads-form.pending")}
            </div>
          </div>
          {!isLocalEntry(lastEntry) && (
            <EntryLink target="_blank" entry={lastEntry}>
              <span>{i18next.t("decks.threads-form.link-to-entry")}</span>
            </EntryLink>
          )}
        </Alert>
      )}
    </div>
  );
};
