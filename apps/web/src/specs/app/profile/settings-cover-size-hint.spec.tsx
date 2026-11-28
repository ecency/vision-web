import "@testing-library/jest-dom";
import { screen } from "@testing-library/react";
import i18next from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveAccount } from "@/core/hooks/use-active-account";
import { ProfileEdit } from "@/app/(dynamicPages)/profile/[username]/settings/_edit";
import { mockActiveUser, renderWithQueryClient } from "@/specs/test-utils";
import enUS from "@/features/i18n/locales/en-US.json";

vi.mock("@/features/shared", () => ({
  ImageUploadButton: () => null,
  success: vi.fn()
}));
vi.mock("@/utils", async () => ({
  ...(await vi.importActual<object>("@/utils")),
  getSdkAuthContext: vi.fn(() => ({})),
  getUser: vi.fn(() => undefined)
}));

describe("ProfileEdit cover size hint (#2213)", () => {
  beforeEach(() => {
    vi.mocked(useActiveAccount).mockReturnValue({
      activeUser: mockActiveUser({ username: "alice" }),
      username: "alice",
      account: null,
      isLoading: false,
      isPending: false,
      isError: false,
      isSuccess: true,
      error: null,
      refetch: vi.fn()
    } as unknown as ReturnType<typeof useActiveAccount>);
  });

  it("shows the recommended size under the cover field and links it to the input", () => {
    renderWithQueryClient(<ProfileEdit />);

    const hint = screen.getByText(i18next.t("profile-edit.cover-image-hint"));
    expect(hint).toHaveAttribute("id");

    const cover = document.querySelector('input[name="cover_image"]');
    expect(cover).not.toBeNull();
    expect(cover).toHaveAttribute("aria-describedby", hint.id);
  });

  it("states the size the apps render best", () => {
    const text = enUS["profile-edit"]["cover-image-hint"];
    expect(text).toContain("2688");
    expect(text).toContain("480");
  });
});
