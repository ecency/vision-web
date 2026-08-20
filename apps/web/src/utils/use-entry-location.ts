import { Entry } from "@/entities";
import { useMemo } from "react";
import { parseEntryLocationFromBody } from "@/core/entries/entry-location";

export function useEntryLocation(entry?: Entry) {
  return useMemo(() => {
    // Feed rows carry this in metadata (the slim step lifts it there before the
    // body goes); a full entry still gets it parsed out of the body.
    const metadataLocation = entry?.json_metadata?.location;
    if (metadataLocation) return metadataLocation;

    return parseEntryLocationFromBody(entry?.body);
  }, [entry]);
}
