"use client";

import { useCallback } from "react";
import { useWaveCreate } from "@/features/waves/components/wave-form/api/use-wave-create";

/// Posts a Wave on Ecency's own Waves and gives back its permlink.
export function useAdventWave() {
  const { mutateAsync } = useWaveCreate();
  return useCallback(
    async (raw: string): Promise<string> => {
      const { entry } = await mutateAsync({ host: "ecency.waves", raw });
      return entry.permlink;
    },
    [mutateAsync]
  );
}
