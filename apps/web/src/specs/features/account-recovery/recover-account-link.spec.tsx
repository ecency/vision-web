import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ flag: false }));

vi.mock("@/config", () => ({
  EcencyConfigManager: {
    Conditional: ({ condition, children }: { condition: (c: unknown) => boolean; children: React.ReactNode }) =>
      condition({ visionFeatures: { accountRecovery: { enabled: h.flag } } }) ? <>{children}</> : null
  }
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}));

import { RecoverAccountLink } from "@/features/account-recovery/recover-account-link";

describe("RecoverAccountLink", () => {
  beforeEach(() => {
    h.flag = false;
  });

  it("renders nothing while the feature flag is off", () => {
    const { container } = render(<RecoverAccountLink label="recover-account.entry-login" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("links to the recovery page while the flag is on and reports the click", () => {
    h.flag = true;
    const onClick = vi.fn();
    render(<RecoverAccountLink label="recover-account.entry-login" onClick={onClick} />);
    const link = screen.getByText("recover-account.entry-login").closest("a")!;
    expect(link).toHaveAttribute("href", "/recover-account");
    fireEvent.click(link);
    expect(onClick).toHaveBeenCalled();
  });
});
