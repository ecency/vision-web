import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateGenerateImageCaches } from "./use-generate-image";
import { ConfigManager, QueryKeys } from "../../core";

describe("invalidateGenerateImageCaches", () => {
  it("invalidates the points balance and the generation history for the user", () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, "invalidateQueries");
    ConfigManager.setQueryClient(client);

    invalidateGenerateImageCaches("alice");

    expect(spy).toHaveBeenCalledWith({ queryKey: QueryKeys.points._prefix("alice") });
    expect(spy).toHaveBeenCalledWith({ queryKey: QueryKeys.ai.images("alice") });
  });
});
