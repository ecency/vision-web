import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ReactNode } from "react";

let activeUser: { username: string } | null = null;
let hydrated = true;

vi.mock("@/core/hooks/use-active-account", () => ({ useActiveAccount: () => ({ activeUser }) }));
vi.mock("@/api/queries", () => ({ useHydrated: () => hydrated }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/features/chat/mattermost-api", () => ({ useMattermostUnread: () => ({ data: undefined }) }));
vi.mock("@/features/shared/navbar/sidebar", () => ({ NavbarSideThemeSwitcher: () => null }));
vi.mock("@/features/shared/switch-lang", () => ({ SwitchLang: () => null }));
vi.mock("@ui/modal/modal-sidebar", () => ({
  ModalSidebar: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));

import { NavbarAskEsie } from "@/features/shared/navbar/navbar-ask-esie";
import { NavbarMainSidebar } from "@/features/shared/navbar/navbar-main-sidebar";
import { ESIE_MOODS } from "@ui/esie/esie-moods.generated";

// Esie answers in chat, which needs a login: logged-out visitors see no way in
describe("Ask Esie entry points", () => {
  beforeEach(() => {
    activeUser = null;
    hydrated = true;
  });

  it("navbar button opens the chat with Esie for a logged-in user", () => {
    activeUser = { username: "alice" };
    const { container } = render(<NavbarAskEsie />);

    const link = screen.getByRole("link", { name: "navbar.ask-esie" });
    expect(link).toHaveAttribute("href", "/chats?dm=esie");
    expect(container.querySelector("img")).toHaveAttribute("src", ESIE_MOODS.avatar.src);
  });

  it("navbar button is not rendered when logged out, or before hydration", () => {
    expect(render(<NavbarAskEsie />).container).toBeEmptyDOMElement();

    activeUser = { username: "alice" };
    hydrated = false;
    expect(render(<NavbarAskEsie />).container).toBeEmptyDOMElement();
  });

  it("sidebar lists Ask Esie only for a logged-in user", () => {
    const { unmount } = render(<NavbarMainSidebar show={true} setShow={vi.fn()} />);
    expect(screen.queryByRole("link", { name: "navbar.ask-esie" })).toBeNull();
    unmount();

    activeUser = { username: "alice" };
    render(<NavbarMainSidebar show={true} setShow={vi.fn()} />);
    expect(screen.getByRole("link", { name: "navbar.ask-esie" })).toHaveAttribute("href", "/chats?dm=esie");
  });
});
