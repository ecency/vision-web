import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/api/queries", () => ({ useHydrated: () => true }));
vi.mock("@/features/chat/mattermost-api", () => ({ useMattermostUnread: () => ({ data: undefined }) }));
vi.mock("@/features/shared/navbar/sidebar", () => ({ NavbarSideThemeSwitcher: () => null }));
vi.mock("@/features/shared/switch-lang", () => ({ SwitchLang: () => null }));
vi.mock("@ui/modal/modal-sidebar", () => ({
  ModalSidebar: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

import { EcencyConfigManager } from "@/config";
import { NavbarMainSidebar } from "@/features/shared/navbar/navbar-main-sidebar";

const raidstead = EcencyConfigManager.CONFIG.visionFeatures.raidstead as { enabled: boolean };

describe("NavbarMainSidebar Raidstead entry", () => {
  afterEach(() => {
    raidstead.enabled = true;
  });

  it("links to Raidstead when the feature is enabled", () => {
    render(<NavbarMainSidebar show={true} setShow={vi.fn()} />);

    expect(screen.getByRole("link", { name: "navbar.raidstead" }).getAttribute("href")).toBe(
      "/raidstead"
    );
  });

  it("leaves Raidstead out when the feature is disabled", () => {
    raidstead.enabled = false;
    render(<NavbarMainSidebar show={true} setShow={vi.fn()} />);

    expect(screen.queryByRole("link", { name: "navbar.raidstead" })).toBeNull();
  });
});
