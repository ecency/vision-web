import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { postBodySummary } from "@ecency/render-helper";
import { SUBMIT_DESCRIPTION_MAX_LENGTH } from "@/app/submit/_consts";
import { cleanupModalContainers, setupModalContainers } from "@/specs/test-utils";

vi.mock("@/utils", async () => ({
  ...(await vi.importActual<typeof import("@/utils")>("@/utils")),
  random: vi.fn(),
  getAccessToken: vi.fn(() => "mock-token")
}));
// The fields read publish state through the hooks barrel. Hand back the real state
// module only, so the editor and dictation hooks in that barrel are not loaded.
vi.mock("@/app/publish/_hooks", async () =>
  vi.importActual("@/app/publish/_hooks/use-publish-state")
);

import { PublishStateProvider, usePublishState } from "@/app/publish/_hooks/use-publish-state";
import { PublishMetaInfoDialog } from "@/app/publish/_components/publish-meta-info-dialog";
import { PublishValidatePostMeta } from "@/app/publish/_components/publish-validate-post-meta";

const FIRST = "Let me tell you a story about O.";
const FINAL = `${FIRST}\n\nO is short for Orchestrator.`;

function renderInComposer(field: ReactNode) {
  const state: { current: ReturnType<typeof usePublishState> | null } = { current: null };
  function Probe() {
    state.current = usePublishState();
    return null;
  }
  render(
    <PublishStateProvider>
      <Probe />
      {field}
    </PublishStateProvider>
  );
  return {
    setBody: (body: string) => act(() => state.current!.setContent(body))
  };
}

// Regression: the description fields must mark what the author types, or the auto
// summary replaces it on the next body change.
describe("publish description fields", () => {
  beforeEach(setupModalContainers);
  afterEach(cleanupModalContainers);

  it("keeps what the author typed in the validation step field", () => {
    const composer = renderInComposer(<PublishValidatePostMeta />);
    composer.setBody(FIRST);

    const field = screen.getByPlaceholderText("publish.preview-subtitle") as HTMLTextAreaElement;
    expect(field.value).toBe(postBodySummary(FIRST, SUBMIT_DESCRIPTION_MAX_LENGTH));

    fireEvent.change(field, { target: { value: "A" } });
    composer.setBody(FINAL);

    expect(field.value).toBe("A");
  });

  it("keeps what the author typed in the description dialog", () => {
    const composer = renderInComposer(<PublishMetaInfoDialog show={true} setShow={vi.fn()} />);
    composer.setBody(FIRST);

    const field = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: "A" } });
    composer.setBody(FINAL);

    expect(field.value).toBe("A");
  });
});
