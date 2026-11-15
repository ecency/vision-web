import { describe, expect, it, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { CommunityCreateDetailsStep } from "@/app/communities/create/_components/community-create-details-step";
import { CommunityTypes } from "@/enums";

// #2075 follow-up: the shared invalid border now shows in the dark theme too,
// and the community title was marked invalid while still empty and untouched.
function renderStep(title: string) {
  render(
    <CommunityCreateDetailsStep
      title={title}
      setTitle={vi.fn()}
      about=""
      setAbout={vi.fn()}
      communityType={CommunityTypes.Topic}
      setCommunityType={vi.fn()}
      onContinue={vi.fn()}
    />
  );
  return screen.getByPlaceholderText("communities-create.title");
}

describe("community title invalid state", () => {
  it("is not invalid while empty", () => {
    expect(renderStep("")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("is invalid when too short", () => {
    expect(renderStep("ab")).toHaveAttribute("aria-invalid", "true");
  });

  it("is valid at three characters", () => {
    expect(renderStep("abc")).toHaveAttribute("aria-invalid", "false");
  });
});
